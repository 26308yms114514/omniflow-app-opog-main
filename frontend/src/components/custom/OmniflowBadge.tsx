import { X } from 'lucide-react';

export default function OmniflowBadge() {
  const handleDelete = () => {
    window.location.href = 'https://www.omniflowai.com/pricing';
  };

  // Only show logo for FREE tier users
  if (import.meta.env.VITE_SUBSCRIPTION_TIER != 'FREE') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 group">
      <div className="relative">
        {/* Delete Button */}
        <button
          onClick={handleDelete}
          className="absolute -top-2 -right-2 bg-white hover:bg-gray-100 rounded-full shadow-lg border border-gray-300 transition-all z-10"
          aria-label="Remove logo"
        >
          <X className="w-3 h-3 text-gray-700" style={{ padding: 0 }} />
        </button>

        {/* Logo Image */}
        <a
          href="https://www.omniflowai.com"
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <img
            src="https://omniflow-team.s3.us-east-1.amazonaws.com/public_asset/Edit+with+Omniflow.png"
            alt="Made with Omniflow"
            className="w-32 h-auto drop-shadow-lg hover:drop-shadow-xl transition-all"
          />
        </a>
      </div>
    </div>
  );
}
