# GPU Training Machine

Collect episodes in the Electron game. They are saved under:

```text
%APPDATA%/swarm/training/episodes
```

Copy the completed `.jsonl` files and their matching `.metadata.json` files to the training machine. Validate them before training:

```powershell
npm run check-training-data -- C:\training-data\episodes
```

Generate the portable, untrained actor model from the game repository with:

```powershell
npm run create-initial-model
```

For an RTX 5070, run the future trainer on Linux or WSL2, not directly on Windows. Install a current NVIDIA driver, CUDA libraries compatible with the installed TensorFlow.js Node GPU package, Node.js LTS, and then install `@tensorflow/tfjs-node-gpu` in the training environment. The game itself does not need this native package.

Keep the trainer as a separate Node.js project or working directory. It reads the copied JSONL episodes, trains on the GPU, and exports `model.json`, `weights.bin`, and an updated `metadata.json`. Those three files are the model artifact to import back into the Electron game.