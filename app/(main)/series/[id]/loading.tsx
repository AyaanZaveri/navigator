import { Skeleton } from "@/components/ui/skeleton";

export default function SeriesLoading() {
  return (
    <div className="min-h-screen overflow-hidden md:pr-1 pb-8">
      <div className="relative">
        <div className="relative h-[46vh] md:h-[62vh] overflow-hidden md:rounded-xl md:mt-2.5">
          <Skeleton className="h-full w-full md:rounded-xl opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/5 via-background/20 to-background/45 md:rounded-xl" />
        </div>
      </div>

      <div className="relative z-10 -mt-54 md:pl-6 bg-background/95 dark:bg-background/50 backdrop-blur-xl rounded-2xl mx-4 pb-6">
        <div className="flex flex-col md:flex-row mx-auto">
          <div className="w-full md:w-[18%] lg:w-[16%] flex-shrink-0 justify-center flex md:block z-50 mt-6">
            <Skeleton className="w-full h-[420px] rounded-lg max-w-1/2 md:max-w-[14rem]" />
          </div>

          <div className="w-full md:w-[82%] lg:w-[84%] pt-2 text-center md:text-start mt-8">
            <div className="px-8 md:pl-8 md:pt-4 md:pr-16 flex flex-col justify-center md:items-start items-center space-y-4">
              <Skeleton className="h-12 w-72 md:w-96" />
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-4 w-full max-w-3xl" />
              <Skeleton className="h-4 w-full max-w-2xl" />
              <Skeleton className="h-4 w-full max-w-xl" />
            </div>
          </div>
        </div>

        <div className="mt-10 md:mt-8 px-8 md:px-0">
          <Skeleton className="h-10 w-48 mb-6" />
          <div className="flex gap-4">
            <Skeleton className="h-52 w-72 rounded-lg" />
            <Skeleton className="h-52 w-72 rounded-lg hidden md:block" />
            <Skeleton className="h-52 w-72 rounded-lg hidden lg:block" />
          </div>
        </div>
      </div>
    </div>
  );
}
