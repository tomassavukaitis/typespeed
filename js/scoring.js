function calculateWPM(correctChars, elapsedSeconds) {
  if (elapsedSeconds <= 0 || correctChars <= 0) return 0;
  return Math.round((correctChars / 5) / (elapsedSeconds / 60));
}

function calculateAccuracy(correctChars, totalTypedChars) {
  if (totalTypedChars <= 0) return 0;
  return Math.round((correctChars / totalTypedChars) * 100);
}
