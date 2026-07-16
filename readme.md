# SWARM Game

A top-down swarm shooter implementation using vanilla JavaScript and HTML5 Canvas.
Built itch.io link: https://cncdani2.itch.io/swarm-test-project

## Local Development Setup

Because the game uses **ES6 Modules**, you cannot run it by simply opening the `index.html` file in your browser from the file system (due to CORS policy). You must serve the files via a local HTTP server.

### Option 1: Python (Recommended)
If you have Python installed, you can start a server with a single command:

**Python 3.x:**
```bash
python -m http.server 8000
```

Then open your browser and navigate to `http://localhost:8000`.

## Asztali alkalmazás (Electron)

A játék elérhető asztali alkalmazásként is az Electron keretrendszernek köszönhetően.

### Futtatás fejlesztői módban
A játék elindításához Electron-ban:
```bash
npm start
```

### EXE fájl készítése (Build)
A játékot az alábbi paranccsal fordíthatod át egyetlen futtatható EXE fájlba:
```bash
npm run build
```
A kész alkalmazás a `dist/` mappában fog megjelenni.

### Option 2: Node.js (http-server)
If you have Node.js installed, you can use the `http-server` package:
```bash
npx http-server .
```
Then navigate to the URL provided in the terminal (usually `http://localhost:8080`).

### Option 3: VS Code "Live Server" Extension
If you use VS Code, you can install the **Live Server** extension (by Ritwick Dey) and click the "Go Live" button in the status bar while `index.html` is open.

## Controls
- **Movement**: WASD
- **Aim**: Mouse
- **Shoot**: Left Mouse Button
