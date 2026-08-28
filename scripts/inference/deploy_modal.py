import modal
import subprocess

app = modal.App("hierarchy-extractor-api-v2")

# We use an A10G GPU for Llama 3 8B (24GB VRAM is plenty for 8B)
vllm_image = (
    modal.Image.from_registry(
        "vllm/vllm-openai:v0.6.0",
        setup_dockerfile_commands=["ENTRYPOINT []"]
    )
    .run_commands(
        "ln -s /usr/bin/python3 /usr/bin/python",
        "python -m pip install huggingface_hub hf-transfer"
    )
    .run_commands(
        "huggingface-cli download akhilles3/llama-3-8b-hierarchy-extractor --local-dir /model/lora",
        "rm -f /model/lora/tokenizer.json /model/lora/tokenizer_config.json /model/lora/special_tokens_map.json"
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        "VLLM_ATTENTION_BACKEND": "FLASH_ATTN"
    })
)

MINUTES = 60

@app.function(
    image=vllm_image,
    gpu="A10G",
    timeout=1800,
    scaledown_window=30 * MINUTES,
    # This requires running `modal secret create huggingface-secret HF_TOKEN=your_token`
    secrets=[modal.Secret.from_name("huggingface-secret")]
)
@modal.concurrent(max_inputs=100)
@modal.web_server(8000, startup_timeout=600)
def serve():
    base_model = "NousResearch/Meta-Llama-3-8B-Instruct"
    adapter_name = "hierarchy-extractor"
    
    cmd = [
        "python", "-m", "vllm.entrypoints.openai.api_server",
        "--model", base_model,
        "--enable-lora",
        "--lora-modules", f"{adapter_name}=/model/lora",
        "--port", "8000",
        "--tensor-parallel-size", "1",
        "--max-model-len", "8192",
        "--gpu-memory-utilization", "0.90",
        "--trust-remote-code",
        "--enforce-eager"
    ]
    
    # Run the vLLM server natively (non-blocking for Modal web_server)
    subprocess.Popen(cmd)
