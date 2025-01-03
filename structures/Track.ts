import { getImageUrl } from "../handlers/fetchImage";

/**
 * @typedef {import("./Aqua")} Aqua
 * @typedef {import("./Player")} Player
 * @typedef {import("./Node")} Node
 */

interface TrackInfo {
    identifier: string;
    isSeekable: boolean;
    author: string;
    length: number;
    isStream: boolean;
    title: string;
    uri: string;
    sourceName: string;
    artworkUrl: string;
}

interface Playlist {
    name: string;
    selectedTrack: number;
}

interface TrackData {
    encoded: string | null;
    info: TrackInfo;
    playlist?: Playlist | null;
}

class Track {
    public info: Readonly<TrackInfo>;
    public requester: Player;
    public nodes: Node;
    public track: string | null;
    public playlist: Playlist | null;

    constructor(data: TrackData, requester: Player, nodes: Node) {
        const { encoded = null, info = {}, playlist = null } = data;
        this.info = Object.freeze({
            identifier: info.identifier,
            isSeekable: info.isSeekable,
            author: info.author,
            length: info.length,
            isStream: info.isStream,
            title: info.title,
            uri: info.uri,
            sourceName: info.sourceName,
            artworkUrl: info.artworkUrl
        });
        this.requester = requester;
        this.nodes = nodes;
        this.track = encoded;
        this.playlist = playlist;
    }

    resolveThumbnail(thumbnail: string | null): string | null {
        if (!thumbnail) return null;
        return thumbnail.startsWith("http") ? thumbnail : getImageUrl(thumbnail, this.nodes);
    }

    async resolve(aqua: Aqua): Promise<Track | null> {
        if (!aqua?.options?.defaultSearchPlatform) return null;

        try {
            const query = `${this.info.author} - ${this.info.title}`;
            const result = await aqua.resolve({
                query,
                source: aqua.options.defaultSearchPlatform,
                requester: this.requester,
                node: this.nodes
            });

            if (!result?.tracks?.length) return null;

            const matchedTrack = result.tracks.find(track => this.isTrackMatch(track)) || result.tracks[0];

            if (matchedTrack) {
                this.updateTrackInfo(matchedTrack);
                return this;
            }

            return null;

        } catch (error) {
            console.error('Error resolving track:', error);
            return null;
        }
    }

    isTrackMatch(track: Track): boolean {
        const { author, title, length } = this.info;
        const { author: tAuthor, title: tTitle, length: tLength } = track.info;

        return tAuthor === author && 
               tTitle === title && 
               (!length || Math.abs(tLength - length) <= 2000);
    }

    updateTrackInfo(track: Track): void {
        if (!track) return;
        this.info = Object.freeze({
            ...this.info,
            identifier: track.info.identifier
        });

        this.track = track.track;
        this.playlist = track.playlist || null;
    }

    /**
     * Cleanup method to help garbage collection
     */
    destroy(): void {
        this.requester = null as any; // Explicitly using 'as any' for null assignment
        this.nodes = null as any; // Explicitly using 'as any' for null assignment
        this.track = null;
        this.playlist = null;
    }
}

export { Track };