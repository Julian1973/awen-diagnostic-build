"""
Python client for the ZenMux Anthropic-compatible Messages API.

Supports text generation (Doubao-Seed-2.0-Pro, Claude, etc.) and
image generation (Gemini models with native image output).

Text usage:
    from anthropic_client import ZenMuxClient

    client = ZenMuxClient()
    reply = client.create_message(
        model="volcengine/doubao-seed-2.0-pro",
        messages=[{"role": "user", "content": "Hello, world"}],
    )
    print(reply["content"][0]["text"])

Image generation usage:
    response = client.generate_image(
        prompt="A serene mountain landscape at sunset",
    )
    # response["content"] contains base64-encoded image data
"""

import base64
import os
import requests


class ZenMuxClient:
    """Client for the ZenMux Anthropic-compatible Messages API.

    Works with any model available on ZenMux, including:
    - volcengine/doubao-seed-2.0-pro  (text LLM)
    - google/gemini-3-pro-image-preview  (text + image generation)
    - google/gemini-2.5-flash-image  (text + image generation, cheaper)
    """

    DEFAULT_BASE_URL = "https://zenmux.ai/api/anthropic/v1"
    DEFAULT_VERSION = "2023-06-01"

    def __init__(self, api_key=None, base_url=None, anthropic_version=None):
        self.api_key = api_key or os.environ.get("ZENMUX_API_KEY")
        if not self.api_key:
            raise ValueError(
                "API key required. Pass api_key or set ZENMUX_API_KEY env var."
            )
        self.base_url = (base_url or self.DEFAULT_BASE_URL).rstrip("/")
        self.anthropic_version = anthropic_version or self.DEFAULT_VERSION

    def _headers(self):
        return {
            "x-api-key": self.api_key,
            "anthropic-version": self.anthropic_version,
            "content-type": "application/json",
        }

    def create_message(
        self,
        messages,
        model="volcengine/doubao-seed-2.0-pro",
        max_tokens=1024,
        system=None,
        temperature=None,
        stop_sequences=None,
    ):
        """Send a message request to the Anthropic-compatible API.

        Args:
            messages: List of message dicts with "role" and "content" keys.
            model: Model identifier to use.
            max_tokens: Maximum tokens in the response.
            system: Optional system prompt string.
            temperature: Optional sampling temperature (0.0 - 1.0).
            stop_sequences: Optional list of stop sequences.

        Returns:
            Parsed JSON response dict.

        Raises:
            requests.HTTPError: If the API returns a non-2xx status.
        """
        payload = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system is not None:
            payload["system"] = system
        if temperature is not None:
            payload["temperature"] = temperature
        if stop_sequences is not None:
            payload["stop_sequences"] = stop_sequences

        resp = requests.post(
            f"{self.base_url}/messages",
            headers=self._headers(),
            json=payload,
            timeout=60,
        )
        resp.raise_for_status()
        return resp.json()

    def generate_image(
        self,
        prompt,
        model="google/gemini-3-pro-image-preview",
        output_path=None,
        max_tokens=4096,
    ):
        """Generate an image using an image-capable model on ZenMux.

        Uses Gemini's native image generation through the Anthropic-compatible
        Messages API. The model is instructed to respond with an image.

        Args:
            prompt: Text description of the image to generate.
            model: Image-capable model ID. Defaults to Gemini 3 Pro Image.
                   Also supports "google/gemini-2.5-flash-image".
            output_path: If provided, save the image to this file path.
            max_tokens: Maximum tokens for the response.

        Returns:
            Parsed JSON response dict. Image data is in
            response["content"] as base64 source blocks.
        """
        messages = [
            {
                "role": "user",
                "content": f"Generate an image: {prompt}",
            }
        ]
        response = self.create_message(
            messages=messages,
            model=model,
            max_tokens=max_tokens,
        )

        if output_path:
            self._save_image(response, output_path)

        return response

    @staticmethod
    def _save_image(response, output_path):
        """Extract and save base64 image data from an API response."""
        for block in response.get("content", []):
            if block.get("type") == "image":
                image_data = base64.b64decode(block["source"]["data"])
                with open(output_path, "wb") as f:
                    f.write(image_data)
                return output_path
        raise ValueError("No image content found in the API response.")


# Backwards-compatible alias
AnthropicClient = ZenMuxClient
