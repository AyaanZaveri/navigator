export interface SceneProgress {
    stage: "title" | "subtitles" | "scene";
    state: "running" | "completed" | "error";
    detail?: string;
}

export function sceneProgressLabel(progress: SceneProgress): string {
    return {
        title: { running: "Searching for the title", completed: "Found the title", error: "Could not find the title" },
        subtitles: { running: "Searching and loading subtitles", completed: "Loaded subtitles", error: "Could not load subtitles" },
        scene: { running: "Finding the scene in the dialogue", completed: "Found the scene", error: "Could not match the scene" },
    }[progress.stage][progress.state];
}
