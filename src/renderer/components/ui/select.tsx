import * as React from "react";
import { cn } from "../../lib/utils";

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

const Select: React.FC<SelectProps> = ({ value, onValueChange, children }) => {
  return (
    <div className="relative">
      {React.Children.map(children, child => {
        if (React.isValidElement(child) && child.type === SelectTrigger) {
          return React.cloneElement(child as React.ReactElement<any>, { value, onValueChange });
        }
        return child;
      })}
    </div>
  );
};

interface SelectTriggerProps {
  children: React.ReactNode;
  id?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const SelectTrigger: React.FC<SelectTriggerProps> = ({ children, id, value, onValueChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  
  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
        <svg
          width="15"
          height="15"
          viewBox="0 0 15 15"
          fill="none"
          className="h-4 w-4 opacity-50"
        >
          <path
            d="m4.5 6 3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="p-1">
            {React.Children.map(children, child => {
              if (React.isValidElement(child) && child.type === SelectContent) {
                return React.cloneElement(child as React.ReactElement<any>, { 
                  onValueChange: (newValue: string) => {
                    onValueChange?.(newValue);
                    setIsOpen(false);
                  }
                });
              }
              return null;
            })}
          </div>
        </div>
      )}
    </>
  );
};

const SelectValue: React.FC<{ placeholder?: string }> = ({ placeholder }) => {
  return <span>{placeholder}</span>;
};

interface SelectContentProps {
  children: React.ReactNode;
  onValueChange?: (value: string) => void;
}

const SelectContent: React.FC<SelectContentProps> = ({ children, onValueChange }) => {
  return (
    <div className="max-h-60 overflow-auto">
      {React.Children.map(children, child => {
        if (React.isValidElement(child) && child.type === SelectItem) {
          return React.cloneElement(child as React.ReactElement<any>, { onValueChange });
        }
        return child;
      })}
    </div>
  );
};

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  onValueChange?: (value: string) => void;
}

const SelectItem: React.FC<SelectItemProps> = ({ value, children, onValueChange }) => {
  return (
    <div
      className="relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
      onClick={() => onValueChange?.(value)}
    >
      {children}
    </div>
  );
};

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };