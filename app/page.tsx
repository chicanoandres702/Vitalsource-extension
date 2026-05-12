export default function Page() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-50 flex flex-col items-center justify-center p-8 font-sans">
      <div className="max-w-2xl w-full bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-8 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Pilot Pro Extension</h1>
              <p className="text-gray-400 text-sm">Autonomous PDF Engine</p>
            </div>
          </div>
          <p className="text-gray-300 leading-relaxed">
            Your Tampermonkey script has been successfully converted into a native Chrome Extension (Manifest V3) with a built-in Side Panel UI.
          </p>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs">1</span>
              Download the Extension
            </h2>
            <p className="text-gray-400 text-sm pl-8">
              Click the <strong className="text-gray-300">Share / Export</strong> button in the top right of AI Studio and select <strong className="text-gray-300">Export to ZIP</strong>. Extract the ZIP file to a folder on your computer.
            </p>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs">2</span>
              Install in Chrome
            </h2>
            <div className="pl-8 space-y-3">
              <p className="text-gray-400 text-sm">
                Open Google Chrome and navigate to <code className="bg-gray-800 px-2 py-1 rounded text-blue-300 font-mono text-xs">chrome://extensions/</code>
              </p>
              <p className="text-gray-400 text-sm">
                Enable <strong className="text-gray-300">Developer mode</strong> using the toggle switch in the top right corner.
              </p>
              <p className="text-gray-400 text-sm">
                Click the <strong className="text-gray-300">Load unpacked</strong> button and select the folder where you extracted the ZIP file.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs">3</span>
              Use the Extension
            </h2>
            <p className="text-gray-400 text-sm pl-8">
              Navigate to a supported VitalSource book, click the Pilot Pro extension icon in your toolbar, and the UI will open in the native Chrome Side Panel.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
