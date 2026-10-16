import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { CameraScreen, type CaptureResult } from './src/spike/CameraScreen';
import { ReviewScreen } from './src/spike/ReviewScreen';

/** Phase 1: the app is the camera spike only. Navigation and real screens arrive in Phase 3/4. */
export default function App() {
  const [result, setResult] = useState<CaptureResult | null>(null);
  return (
    <>
      <StatusBar style="light" />
      {result ? (
        <ReviewScreen result={result} onRetake={() => setResult(null)} />
      ) : (
        <CameraScreen onCaptured={setResult} />
      )}
    </>
  );
}
