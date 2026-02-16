"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { User, Calendar, MapPin, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { isAIAskOpenAtom } from "@/lib/atoms";

interface PersonCardProps {
  person: {
    id: string;
    name: string;
    role?: string;
    type?: string;
    overview?: string;
    birthDate?: string;
    birthLocation?: string;
    imageUrl?: string;
  };
  className?: string;
  index?: number;
  onClick?: () => void;
}

export const PersonCard: React.FC<PersonCardProps> = ({
  person,
  className,
  index = 0,
  onClick,
}) => {
  const router = useRouter();
  const [isAIAskOpen, setIsAIAskOpen] = useAtom(isAIAskOpenAtom);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      router.push(`/person/${person.id}`);
    }
    if (isAIAskOpen) {
      setIsAIAskOpen(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      return new Date(dateString).getFullYear();
    } catch {
      return null;
    }
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
        <div className="flex gap-3 items-start w-full">
          <Avatar className="w-10 h-10 flex-shrink-0">
            {person.imageUrl && (
              <AvatarImage
                src={person.imageUrl}
                alt={person.name}
                className="object-cover"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(false)}
              />
            )}
            <AvatarFallback className="bg-muted">
              <User className="h-5 w-5 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-sm leading-tight group-hover:text-primary transition-colors">
                  {person.name}
                </h3>

                {(person.role || person.type) && (
                  <div className="flex items-center gap-1 mt-1">
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      {person.role || person.type}
                    </Badge>
                  </div>
                )}

                {/* Birth info */}
                {(person.birthDate || person.birthLocation) && (
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    {person.birthDate && formatDate(person.birthDate) && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(person.birthDate)}</span>
                      </div>
                    )}
                    {person.birthLocation && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span className="truncate max-w-[120px]">
                          {person.birthLocation}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Overview preview */}
                {person.overview && (
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                    {person.overview.length > 100
                      ? `${person.overview.substring(0, 100)}...`
                      : person.overview}
                  </p>
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
