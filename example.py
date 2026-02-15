"""
Examples for the ZenMux Anthropic-compatible API client.

Set your API key first:
    export ZENMUX_API_KEY="sk-..."

Then run:
    python example.py text       # Text generation with Doubao-Seed-2.0-Pro
    python example.py image      # Image generation with Gemini
"""

import sys

from anthropic_client import ZenMuxClient


def text_example():
    """Send a text prompt to Doubao-Seed-2.0-Pro."""
    client = ZenMuxClient()
    response = client.create_message(
        model="volcengine/doubao-seed-2.0-pro",
        max_tokens=1024,
        messages=[{"role": "user", "content": "Hello, world"}],
    )
    for block in response.get("content", []):
        if block.get("type") == "text":
            print(block["text"])


def image_example():
    """Generate an image using Gemini via ZenMux and save it."""
    client = ZenMuxClient()
    response = client.generate_image(
        prompt="A serene mountain landscape at sunset, digital art style",
        model="google/gemini-3-pro-image-preview",
        output_path="generated_image.png",
    )
    print("Image saved to generated_image.png")
    # Also print any text the model returned alongside the image
    for block in response.get("content", []):
        if block.get("type") == "text":
            print(block["text"])


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "text"
    if mode == "image":
        image_example()
    else:
        text_example()
