"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Tag, Hash, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAtom } from "jotai";
import { isAIAskOpenAtom } from "@/lib/atoms";

interface GenreCardProps {
  genre: {
    Id?: string;
    Name: string;
    count?: number;
  };
  className?: string;
  index?: number;
  onClick?: (genreName: string) => void;
}

export const GenreCard: React.FC<GenreCardProps> = ({
  genre,
  className,
  index = 0,
  onClick,
}) => {
  const [isAIAskOpen, setIsAIAskOpen] = useAtom(isAIAskOpenAtom);

  const handleClick = () => {
    if (onClick) {
      onClick(genre.Name);
    }
    
    // Don't close AIAsk when clicking genre cards, as user might want to continue browsing
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.3,
        delay: index * 0.1,
        ease: "easeOut",
      }}
    >
      <div
        className={cn(
          "group cursor-pointer transition duration-200 bg-card backdrop-blur-sm p-3 rounded-xl hover:bg-card/50 w-full active:scale-[0.99]",
          className
        )}
        onClick={handleClick}
      >
        <div className="flex gap-3 items-center w-full">
          {/* Genre icon */}
          <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
            <Tag className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-sm leading-tight group-hover:text-primary transition-colors">
                  {genre.Name}
                </h3>
                
                {/* Item count if available */}
                {genre.count && (
                  <div className="flex items-center gap-1 mt-1">
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                      <Hash className="h-3 w-3 mr-1" />
                      {genre.count} item{genre.count !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                )}
              </div>
              
              <Info className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
