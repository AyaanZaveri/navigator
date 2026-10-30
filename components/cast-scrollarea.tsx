"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CarouselAction } from "@/components/carousel-action";
import type { CastMember } from "@/lib/cast";

export function CastScrollArea({ cast }: { cast: CastMember[] }) {
    const headingId = useId();
    const viewport = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ start: true, end: false });
    const updatePosition = () => {
        const element = viewport.current;
        if (element) setPosition({ start: element.scrollLeft <= 1, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 1 });
    };
    useEffect(() => {
        const element = viewport.current;
        if (!element) return;
        const observer = new ResizeObserver(updatePosition);
        observer.observe(element);
        updatePosition();
        return () => observer.disconnect();
    }, [cast]);

    const scroll = (direction: number) => {
        const element = viewport.current;
        if (!element) return;
        element.scrollBy({
            left: direction * element.clientWidth * 0.8,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        });
    };

    if (!cast.length) return null;

    return (
        <section aria-labelledby={headingId} className="relative z-10 mb-8">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id={headingId} className="font-poppins text-xl font-semibold text-foreground sm:text-2xl">Cast</h2>
                <div className="flex shrink-0 items-center gap-2">
                    <CarouselAction size="icon-sm" aria-label="Scroll cast left" disabled={position.start} onClick={() => scroll(-1)}>
                        <ChevronLeft className="size-4" />
                    </CarouselAction>
                    <CarouselAction size="icon-sm" aria-label="Scroll cast right" disabled={position.end} onClick={() => scroll(1)}>
                        <ChevronRight className="size-4" />
                    </CarouselAction>
                </div>
            </div>
            <div ref={viewport} onScroll={updatePosition} tabIndex={0} role="region" aria-label="Cast members" className="overflow-x-auto overscroll-x-contain rounded-lg pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ul className="flex w-max gap-6">
                    {cast.map((member) => (
                        <li key={member.id} className="w-28 shrink-0 text-center">
                            <Avatar className="mx-auto size-24">
                                {member.image && <AvatarImage src={member.image} alt={member.name} loading="lazy" className="object-cover object-center" />}
                                <AvatarFallback className="text-2xl font-medium text-muted-foreground">
                                    {member.name.trim().split(/\s+/u).slice(0, 2).map((part) => Array.from(part)[0]).join("")}
                                </AvatarFallback>
                            </Avatar>
                            <p className="mt-3 break-words text-sm font-semibold leading-snug text-foreground">{member.name}</p>
                            {member.role && <p className="mt-1 break-words text-[13px] leading-snug text-muted-foreground">{member.role}</p>}
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
