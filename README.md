# Phone Superpowers

**Your phone can do _that_ from a browser?** Phone-only web APIs most devs have never used, each with a live demo. Built for a talk at the Chennai web dev meetup.

**Live:** https://jaga3421.github.io/phone-superpowers/

Open it on your phone. Best on Chrome for Android; iPhones get fallbacks where Safari allows them.

## Crowd games

| Demo | APIs | Android | iPhone |
|---|---|---|---|
| Audience light show | Camera torch, screen, vibration | ✅ | ⚠️ screen only |
| Magic wand duel | DeviceMotion `rotationRate`, Web Audio | ✅ | ✅ |
| Blow to pop the balloon | Microphone + `AnalyserNode` | ✅ | ✅ |
| Tilt the ball into the hole | DeviceOrientation | ✅ | ✅ |
| Shake battle: Idli vs Dosa | DeviceMotion acceleration | ✅ | ✅ |
| Point to Marina Beach | Geolocation + compass heading | ✅ | ✅ |

## API tour

| Demo | APIs | Android | iPhone |
|---|---|---|---|
| Vibration & haptics | `navigator.vibrate`, `<input switch>` haptic trick | ✅ | ⚠️ |
| Read & write NFC tags | Web NFC | ✅ | ❌ |
| Native QR & barcode scanner | `BarcodeDetector` | ✅ | ❌ |
| Contact picker | Contact Picker API | ✅ | ❌ |
| Auto-read SMS OTP | WebOTP | ✅ | ⚠️ keyboard autofill |
| Voice commands (Tamil too) | Web Speech API | ✅ | ✅ |
| Native share sheet with files | Web Share | ✅ | ✅ |
| Keep the screen on | Screen Wake Lock | ✅ | ✅ |
| Talk to Bluetooth gadgets | Web Bluetooth | ✅ | ❌ |
| Raw sensor feed | Generic Sensor API | ✅ | ❌ |
| Ten-finger paint | Pointer Events | ✅ | ✅ |
| Battery, network & device hints | Battery Status, Network Information | ✅ | ❌ |
| Fullscreen + lock orientation | Fullscreen, Screen Orientation | ✅ | ❌ |
| Foldable phone posture | Device Posture, Viewport Segments | ✅ foldables | ❌ |
| 3D model in the room | `<model-viewer>` (WebXR / Scene Viewer / Quick Look) | ✅ | ✅ |

## Run locally

No build step. Any static server works, but most of these APIs need HTTPS (or `localhost`):

```bash
python3 -m http.server 8000
```

To test on a phone over your LAN you need HTTPS. The GitHub Pages link is the easiest way.
