import React, { useState } from 'react';
import { Shield, Key, Copy, RefreshCw, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

interface MasterKeySetupProps {
  isOpen: boolean;
  onComplete: (masterKey: string) => void;
  onCancel: () => void;
}

export const MasterKeySetup: React.FC<MasterKeySetupProps> = ({ isOpen, onComplete, onCancel }) => {
  const [step, setStep] = useState<'intro' | 'generate' | 'verify'>('intro');
  const [masterKey, setMasterKey] = useState('');
  const [verifyKey, setVerifyKey] = useState('');
  const [showMasterKey, setShowMasterKey] = useState(false);
  const [showVerifyKey, setShowVerifyKey] = useState(false);
  const [keysSaved, setKeysSaved] = useState(false);
  const [useCustomKey, setUseCustomKey] = useState(false);

  if (!isOpen) return null;

  const generateNewKey = async () => {
    try {
      const newKey = await window.electronAPI?.ai?.generateMasterKey();
      setMasterKey(newKey || '');
      setStep('generate');
    } catch (error) {
      console.error('Failed to generate master key:', error);
    }
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(masterKey);
    setKeysSaved(true);
    setTimeout(() => setKeysSaved(false), 2000);
  };

  const proceedToVerify = () => {
    if (!keysSaved && !useCustomKey) {
      alert('Please save your master key before proceeding!');
      return;
    }
    setStep('verify');
  };

  const handleVerifyAndComplete = () => {
    if (masterKey === verifyKey) {
      onComplete(masterKey);
    } else {
      alert('Master keys do not match. Please try again.');
      setVerifyKey('');
    }
  };

  const handleCustomKeyChange = (value: string) => {
    setMasterKey(value);
    setUseCustomKey(true);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-8 max-w-2xl w-full mx-4 border border-gray-700">
        {step === 'intro' && (
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <Shield className="w-16 h-16 text-blue-400" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-4">Secure Your AI Keys</h2>
            <p className="text-gray-300 mb-6 leading-relaxed">
              To securely store your AI service API keys, we need to set up a master key. 
              This key will encrypt all your sensitive data and ensure only you can access it.
            </p>
            
            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
                <div className="text-left">
                  <p className="text-yellow-200 text-sm font-medium mb-1">Important Security Notice</p>
                  <p className="text-yellow-300 text-sm">
                    Your master key cannot be recovered if lost. Please save it securely 
                    (password manager, secure note, etc.) before proceeding.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={generateNewKey}
                className="flex-1 flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                <Key className="w-4 h-4" />
                <span>Generate Master Key</span>
              </button>
              <button
                onClick={onCancel}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {step === 'generate' && (
          <div>
            <div className="flex items-center space-x-3 mb-6">
              <Key className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl font-bold text-white">Your Master Key</h2>
            </div>

            <div className="bg-gray-900 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">Generated Master Key</label>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowMasterKey(!showMasterKey)}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title={showMasterKey ? 'Hide key' : 'Show key'}
                  >
                    {showMasterKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={generateNewKey}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title="Generate new key"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleCopyKey}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title="Copy to clipboard"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div className="relative">
                <input
                  type={showMasterKey ? 'text' : 'password'}
                  value={masterKey}
                  onChange={(e) => handleCustomKeyChange(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Your master key will appear here..."
                />
              </div>
              
              {keysSaved && (
                <div className="flex items-center space-x-2 mt-2 text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">Key copied to clipboard</span>
                </div>
              )}
            </div>

            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
                <div>
                  <p className="text-red-200 text-sm font-medium mb-1">Critical: Save Your Key Now</p>
                  <p className="text-red-300 text-sm">
                    Copy this key and save it in a secure location. If you lose this key, 
                    you will lose access to all your stored API keys and will need to set them up again.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={proceedToVerify}
                className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                disabled={!masterKey}
              >
                I've Saved My Key - Continue
              </button>
              <button
                onClick={() => setStep('intro')}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div>
            <div className="flex items-center space-x-3 mb-6">
              <Shield className="w-6 h-6 text-green-400" />
              <h2 className="text-xl font-bold text-white">Verify Master Key</h2>
            </div>

            <p className="text-gray-300 mb-6">
              Please enter your master key again to verify you have it saved correctly.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Re-enter Master Key
              </label>
              <div className="relative">
                <input
                  type={showVerifyKey ? 'text' : 'password'}
                  value={verifyKey}
                  onChange={(e) => setVerifyKey(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your master key..."
                />
                <button
                  onClick={() => setShowVerifyKey(!showVerifyKey)}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-white transition-colors"
                >
                  {showVerifyKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={handleVerifyAndComplete}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!verifyKey}
              >
                Complete Setup
              </button>
              <button
                onClick={() => setStep('generate')}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};