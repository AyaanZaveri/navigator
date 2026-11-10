import styles from "./player-loading-status.module.css";

export function PlayerLoadingStatus({ label }: { label: string }) {
    return <span className={styles.status} role="status">
        <span>{label}</span>
        <span className={styles.sheen} aria-hidden="true">{label}</span>
    </span>;
}
