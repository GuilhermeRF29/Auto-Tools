import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../utils/cn';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  expandable?: boolean;
}

const Card = ({
  children,
  className = '',
  onClick,
  expandable = false,
}: CardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [placeholderHeight, setPlaceholderHeight] = useState<number | string>('auto');

  useEffect(() => {
    if (isExpanded) {
      // Prevent background scrolling
      document.body.style.overflow = 'hidden';
      // VERY IMPORTANT: Apply class to body to trigger CSS escape hatch!
      document.body.classList.add('has-expanded-card');
      
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 150);
      
      return () => {
        document.body.style.overflow = '';
        document.body.classList.remove('has-expanded-card');
        window.dispatchEvent(new Event('resize'));
        clearTimeout(timer);
      };
    }
  }, [isExpanded]);

  useEffect(() => {
    if (containerRef.current && !isExpanded) {
      setPlaceholderHeight(containerRef.current.getBoundingClientRect().height);
    }
  }, [isExpanded]);

  const motionProps = !isExpanded && onClick ? {
    whileHover: { y: -4, scale: 1.01, transition: { duration: 0.2 } },
    whileTap: { scale: 0.98 }
  } : {};

  return (
    <>
      {/* Placeholder to prevent layout collapse when card is expanded and fixed */}
      {isExpanded && (
        <div
          style={{ height: placeholderHeight }}
          className={cn("bg-slate-50/50 border border-dashed border-slate-200 rounded-[2rem]", className)}
        />
      )}

      {/* Backdrop for expanded card */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9998] transition-opacity duration-300"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(false);
          }}
        />
      )}

      {/* The actual card */}
      <motion.div
        ref={containerRef}
        onClick={!isExpanded ? onClick : undefined}
        className={cn(
          "bg-white border border-slate-200 rounded-[2rem] shadow-sm transition-all group",
          !isExpanded && "relative overflow-hidden",
          onClick && !isExpanded && "cursor-pointer hover:shadow-xl hover:border-blue-200",
          className,
          isExpanded && "fixed inset-0 m-auto w-[95vw] h-[95vh] z-[9999] shadow-2xl p-6 sm:p-8 flex flex-col card-expanded-active overflow-y-auto"
        )}
        {...motionProps}
      >
        {expandable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className={cn(
              "absolute flex items-center justify-center transition-all z-[100] cursor-pointer",
              isExpanded
                ? "top-5 right-5 p-2 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-500 hover:text-slate-700 shadow-sm"
                : "top-5 left-5 w-8 h-8 rounded-2xl bg-white/90 backdrop-blur-sm border border-slate-200 text-slate-600 opacity-0 group-hover:opacity-100 hover:scale-110 shadow-md"
            )}
            title={isExpanded ? "Minimizar" : "Expandir"}
          >
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        )}
        {children}
      </motion.div>
    </>
  );
};

export default Card;
