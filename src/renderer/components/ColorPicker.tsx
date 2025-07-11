import React, { useState, useRef, useEffect } from 'react';

interface ColorPickerProps {
  currentColor: string;
  onChange: (color: string) => void;
}

const PREDEFINED_COLORS = [
  '#ef4444', // red
  '#f97316', // orange  
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#10b981', // emerald
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
  '#64748b', // slate
  '#6b7280', // gray
  '#71717a', // zinc
  '#737373', // neutral
  '#78716c'  // stone
];

export const ColorPicker: React.FC<ColorPickerProps> = ({ currentColor, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 rounded border-2 border-gray-600 hover:border-gray-400 transition-colors"
        style={{ backgroundColor: currentColor }}
        title="Change color"
      />
      
      {isOpen && (
        <div className="absolute top-10 left-0 z-50 bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-lg">
          <div className="grid grid-cols-6 gap-2 w-48">
            {PREDEFINED_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  onChange(color);
                  setIsOpen(false);
                }}
                className={`w-6 h-6 rounded border-2 transition-all hover:scale-110 ${
                  currentColor === color ? 'border-white' : 'border-gray-600 hover:border-gray-400'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};