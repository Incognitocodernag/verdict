import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// @ts-ignore - Ignore Vite-specific inline CSS loading query parameters in TS compiling
import stylesheet from './style.css?inline';

console.log('=== VERDICT CONTENT SCRIPT INITIALIZED ===');

/**
 * Initializes and mounts the React-based floating dashboard into Amazon's DOM
 * encapsulated within a Shadow Root to guarantee style/layout isolation.
 */
function mountExtension() {
  const containerId = 'verdict-extension-root';
  
  // Prevent double rendering
  if (document.getElementById(containerId)) return;

  const container = document.createElement('div');
  container.id = containerId;
  
  // Attach Shadow DOM to prevent CSS bleeding (Amazon stylesheet isolation)
  const shadowRoot = container.attachShadow({ mode: 'open' });
  
  // Create and inject compiled Tailwind CSS style tag into shadow root
  const styleTag = document.createElement('style');
  styleTag.textContent = stylesheet;
  shadowRoot.appendChild(styleTag);
  
  // Create mounting target element inside shadow root
  const mountNode = document.createElement('div');
  shadowRoot.appendChild(mountNode);
  
  // Append container to document body
  document.body.appendChild(container);
  
  // Instantiate React application root
  const root = ReactDOM.createRoot(mountNode);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  
  console.log('Verdict Extension: Shadow DOM and React App mounted successfully.');
}

// Initialize when page is fully constructed
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  mountExtension();
} else {
  document.addEventListener('DOMContentLoaded', mountExtension);
}
