import { EventEmitter } from "events";
import { Connection } from "./Connection";
import { Queue } from "./Queue";
import { Filters } from "./Filters";

interface PlayerOptions {
    guildId?: string;
    textChannel?: string;
    voiceChannel?: string;
    mute?: boolean;
    deaf?: boolean;
    defaultVolume?: number;
    loop?: "none" | "track" | "queue";
    shouldDeleteMessage?: boolean;
}

interface PlayerState {
    connected: boolean;
    position: number;
    ping: number;
    time: number;
}

interface Track {
    track: string;
    resolve: (aqua: any) => Track; // Replace `any` with the actual type of `aqua`
}

interface PlayerUpdatePacket {
    state?: PlayerState;
}

interface EventPayload {
    code: number;
    guildId: string;
    type: string;
    reason?: string;
}

class Player extends EventEmitter {
    private aqua: any; // Replace `any` with the actual type of `aqua`
    private nodes: any; // Replace `any` with the actual type of `nodes`
    public guildId: string | undefined;
    public textChannel: string | undefined;
    public voiceChannel: string | undefined;
    public connection: Connection;
    public filters: Filters;
    public mute: boolean;
    public deaf: boolean;
    public volume: number;
    public loop: "none" | "track" | "queue";
    public data: Map<any, any>; // Replace `any` with appropriate types
    public queue: Queue<any>
    public position: number;
    public current: Track | null;
    public playing: boolean;
    public paused: boolean;
    public connected: boolean;
    public timestamp: number;
    public ping: number;
    public nowPlayingMessage: any; // Replace `any` with the actual type
    public previousTracks: Track[];
    public shouldDeleteMessage: boolean;
    private _boundPlayerUpdate: (packet: PlayerUpdatePacket) => void;
    private _boundHandleEvent: (payload: EventPayload) => void;
    #dataStore: WeakMap<any, any>; // Replace `any` with appropriate types

    constructor(aqua: any, nodes: any, options: PlayerOptions = {}) {
        super();
        this.aqua = aqua;
        this.nodes = nodes;
        this.guildId = options.guildId;
        this.textChannel = options.textChannel;
        this.voiceChannel = options.voiceChannel;
        this.connection = new Connection(this);
        this.filters = new Filters(this);
        this.mute = options.mute ?? false;
        this.deaf = options.deaf ?? false;
        this.volume = options.defaultVolume ?? 100;
        this.loop = options.loop ?? "none";
        this.data = new Map();
        this.queue = new Queue();
        this.position = 0;
        this.current = null;
        this.playing = false;
        this.paused = false;
        this.connected = false;
        this.timestamp = 0;
        this.ping = 0;
        this.nowPlayingMessage = null;
        this.previousTracks = [];
        this.shouldDeleteMessage = options.shouldDeleteMessage ?? true;
        this._boundPlayerUpdate = this.onPlayerUpdate.bind(this);
        this._boundHandleEvent = this.handleEvent.bind(this);
        this.on("playerUpdate", this._boundPlayerUpdate);
        this.on("event", this._boundHandleEvent);
    }

    onPlayerUpdate(packet: PlayerUpdatePacket): void {
        if (!packet?.state) return;
        const { state } = packet;
        const { connected, position, ping, time } = state;
        this.connected = connected;
        this.position = position;
        this.ping = ping;
        this.timestamp = time;
        this.aqua.emit("playerUpdate", this, packet);
    }

    get previous(): Track | null {
        return this.previousTracks.length ? this.previousTracks[0] : null;
    }

    addToPreviousTrack(track: Track): void {
        if (this.previousTracks.length >= 50) {
            this.previousTracks.pop();
        }
        this.previousTracks.unshift(track);
    }

    /**
     * Play the next track in the queue.
     *
     * @throws {Error} If the player is not connected.
     * @returns {Promise<Player>} The player instance.
     */
    play(): this {
        if (!this.connected) throw new Error("Player must be connected first.");
        if (!this.queue.length) return this;
        const track = this.queue.shift();
        this.current = track.track ? track : track.resolve(this.aqua);
        this.playing = true;
        this.position = 0;
        this.aqua.emit("debug", this.guildId, `Playing track: ${this.current?.track}`);
        this.updatePlayer({ track: { encoded: this.current?.track } });
        return this;
    }

    /**
     * Connects the player to a specified voice channel.
     *
     * @param {Object} options - Options for connecting the player.
     * @param {string} options.guildId - The ID of the guild.
     * @param {string} options.voiceChannel - The ID of the voice channel to connect to.
     * @param {boolean} [options.deaf=true] - Whether the player should be self-deafened.
     * @param {boolean} [options.mute=false] - Whether the player should be self-muted.
     * @throws {Error} If the player is already connected.
     * @returns {Promise<Player>} The player instance.
     */
    connect(options: { guildId: string; voiceChannel: string; deaf?: boolean; mute?: boolean; }): this {
        if (this.connected) throw new Error("Player is already connected.");
        const {
            guildId,
            voiceChannel,
            deaf = true,
            mute = false
        } = options;
        this.send({
            guild_id: guildId,
            channel_id: voiceChannel,
            self_deaf: deaf,
            self_mute: mute
        });
        this.connected = true;
        this.aqua.emit("debug", this.guildId, `Player connected to voice channel: ${voiceChannel}.`);
        return this;
    }

    destroy(): this {
        if (!this.connected) return this;
        this.updatePlayer({ track: { encoded: null } });
        this.queue.clear();
        this.current = null;
        this.previousTracks.length = 0;
        this.playing = false;
        this.position = 0;
        this.send({ guild_id: this.guildId, channel_id: null });
        this.connected = false;
        this.removeListener("playerUpdate", this._boundPlayerUpdate);
        this.removeListener("event", this._boundHandleEvent);
        return this;
    }

    /**
     * Pauses or resumes the player.
     *
     * @param {boolean} paused - If true, the player will be paused; if false, it will resume.
     * @returns {Promise<Player>} The player instance.
     */
    pause(paused: boolean): this {
        this.paused = paused;
        this.updatePlayer({ paused });
        return this;
    }

    /**
     * Seeks to a position in the currently playing track.
     *
     * @param {number} position - The position in milliseconds to seek to.
     * @throws {Error} If the position is negative.
     * @returns {Promise<Player>} The player instance.
     */
    seek(position: number): this {
        if (position < 0) throw new Error("Seek position cannot be negative.");
        if (!this.playing) return this;
        this.position = position;
        this.updatePlayer({ position });
        return this;
    }

    stop(): this {
        if (!this.playing) return this;
        this.updatePlayer({ track: { encoded: null } });
        this.playing = false;
        this.position = 0;
        return this;
    }

    /**
     * Sets the volume of the player.
     *
     * @param {number} volume - The volume to set, between 0 and 200.
     * @throws {Error} If the volume is out of range.
     * @returns {Promise<Player>} The player instance.
     */
    setVolume(volume: number): this {
        if (volume < 0 || volume > 200) throw new Error("Volume must be between 0 and 200.");
        this.volume = volume;
        this.updatePlayer({ volume });
        return this;
    }

    /**
     * Sets the loop mode of the player.
     *
     * @param {string} mode - The loop mode to set, either "none", "track", or "queue".
     * @throws {Error} If the mode is not one of the above.
     * @returns {Promise<Player>} The player instance.
     */
    setLoop(mode: "none" | "track" | "queue"): this {
        const validModes = new Set(["none", "track", "queue"]);
        if (!validModes.has(mode)) throw new Error("Loop mode must be 'none', 'track', or 'queue'.");
        this.loop = mode;
        this.updatePlayer({ loop: mode });
        return this;
    }

    /**
     * Sets the text channel for the player.
     *
     * @param {string} channel - The ID of the text channel to set.
     * @returns {Promise<Player>} The player instance.
     */
    setTextChannel(channel: string): this {
        this.updatePlayer({ text_channel: channel });
        return this;
    }

    /**
     * Sets the voice channel for the player.
     *
     * @param {string} channel - The ID of the voice channel to set.
     * @throws {TypeError} If the channel is not a non-empty string.
     * @throws {ReferenceError} If the player is already connected to the channel.
     * @returns {Promise<Player>} The player instance.
     */
    setVoiceChannel(channel: string): this {
        if (!channel?.length) throw new TypeError("Channel must be a non-empty string.");
        if (this.connected && channel === this.voiceChannel) {
            throw new ReferenceError(`Player already connected to ${channel}.`);
        }
        this.voiceChannel = channel;
        this.connect({
            deaf: this.deaf,
            guildId: this.guildId ?? '',
            voiceChannel: channel,
            mute: this.mute
          });
        return this;
    }

    disconnect(): void {
        this.updatePlayer({ track: { encoded: null } });
        this.connected = false;
        this.send({ guild_id: this.guildId, channel_id: null });
        this.aqua.emit("debug", this.guildId, "Player disconnected.");
    }

    shuffle(): this {
        const len = this.queue.length;
        for (let i = len - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
        return this;
    }

    getQueue() {
        return this.queue
    }

    replay(): this {
        return this.seek(0);
    }

    skip(): this | undefined {
        this.stop();
        return this.playing ? this.play() : undefined;
    }

    static EVENT_HANDLERS = new Map<string, string>([
        ["TrackStartEvent", "trackStart"],
        ["TrackEndEvent", "trackEnd"],
        ["TrackExceptionEvent", "trackError"],
        ["TrackStuckEvent", "trackStuck"],
        ["TrackChangeEvent", "trackChange"],
        ["WebSocketClosedEvent", "socketClosed"]
    ]);

    handleEvent = (payload: EventPayload): void => {
        const player = this.aqua.players.get(payload.guildId);
        if (!player) return;
        const track = player.current;
        const handlerName = Player.EVENT_HANDLERS.get(payload.type);
        if (handlerName) {
            this[handlerName](player, track, payload);
        } else {
            this.handleUnknownEvent(player, payload);
        }
    }

    trackStart(player: Player, track: Track): void {
        this.playing = true;
        this.paused = false;
        this.aqua.emit("trackStart", player, track);
    }

    trackChange(player: Player, track: Track): void {
        this.playing = true;
        this.paused = false;
        this.aqua.emit("trackChange", player, track);
    }

    async trackEnd(player: Player, track: Track, payload: EventPayload): Promise<void> {
        if (this.shouldDeleteMessage && this.nowPlayingMessage) {
            try {
                await this.nowPlayingMessage.delete();
            } catch {
                // Ignore errors
            } finally {
                this.nowPlayingMessage = null;
            }
        }
        const reason = payload.reason?.replace("_", "").toLowerCase();
        if (reason === "loadfailed" || reason === "cleanup") {
            if (player.queue.isEmpty()) {
                this.aqua.emit("queueEnd", player);
                return;
            }
             player.play();
        }
        switch (this.loop) {
            case "track":
                this.aqua.emit("trackRepeat", player, track);
                player.queue.unshift(track);
                break;
            case "queue":
                this.aqua.emit("queueRepeat", player, track);
                player.queue.push(track);
                break;
        }
        if (player.queue.isEmpty()) {
            this.playing = false;
            this.aqua.emit("queueEnd", player);
             this.cleanup();
        }
         player.play();
    }

    trackError(player: Player, track: Track, payload: EventPayload): void {
        this.aqua.emit("trackError", player, track, payload);
         this.stop();
    }

    trackStuck(player: Player, track: Track, payload: EventPayload): void {
        this.aqua.emit("trackStuck", player, track, payload);
         this.stop();
    }

    socketClosed(player: Player, payload: EventPayload): void {
        if (payload?.code === 4015 || payload?.code === 4009) {
            this.send({
                guild_id: payload.guildId,
                channel_id: this.voiceChannel,
                self_mute: this.mute,
                self_deaf: this.deaf,
            });
        }
        this.aqua.emit("socketClosed", player, payload);
        this.pause(true);
        this.aqua.emit("debug", this.guildId, "Player paused due to socket closure.");
    }

    send(data: any): void { // Replace `any` with the actual type
        this.aqua.send({ op: 4, d: data });
    }

    set(key: any, value: any): void { // Replace `any` with appropriate types
        this.#dataStore.set(key, value);
    }

    get(key: any): any { // Replace `any` with appropriate types
        return this.#dataStore.get(key);
    }

    clearData(): this {
        this.#dataStore = new WeakMap();
        return this;
    }

    async updatePlayer(data: any): Promise<void> { // Replace `any` with appropriate types
        return this.nodes.rest.updatePlayer({
            guildId: this.guildId,
            data,
        });
    }

    handleUnknownEvent(payload: EventPayload, track: any): void {
        const error = new Error(`Node encountered an unknown event: '${payload.type}'`);
        this.aqua.emit("nodeError", this, error);
    }

    async cleanup(): Promise<void> {
        if (!this.playing && !this.paused && this.queue.isEmpty()) {
            this.destroy();
        }
        this.clearData();
    }
}

export { Player };