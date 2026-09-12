# Gesture Galaxy

A static, camera-controlled 3D particle galaxy for AI Practice Club.

## Publish with GitHub Pages

1. Upload `index.html`, `styles.css`, and `app.js` to the same folder in your repository.
2. In GitHub, open **Settings → Pages**.
3. Select **Deploy from a branch**, then choose the branch and folder containing these files.
4. Open the HTTPS Pages link and allow camera access.

No backend or API key is required. Hand tracking runs locally in the browser using MediaPipe. Internet access is required when the page first loads the MediaPipe library and hand-landmark model.

The cover includes five particle-density levels: 5K, 10K, 20K, 35K, and 50K. The default is 20K. Controls are index movement, a forward index tap for a supernova, open-palm horizontal movement for unlimited 3D rotation, and slow hand opening/closing for radial expansion or contraction.

For the existing `ai-practice-club` repository, put the three web files in a folder such as `gesture-galaxy/`. The resulting path will be:

`https://tangyuerex-web.github.io/ai-practice-club/gesture-galaxy/`
