import { Player } from './Player';

interface Voice {
    sessionId: string | null;
    endpoint: string | null;
    token: string | null;
}

class Connection {
    private player: Player | null;
    private voice: Voice;
    private region: string | null;
    private selfDeaf: boolean;
    private selfMute: boolean;
    private voiceChannel: string | null;
    private lastUpdateTime: number;
    private updateThrottle: number;

    constructor(player: Player) {
        this.player = player;
        this.voice = { sessionId: null, endpoint: null, token: null };
        this.region = null;
        this.selfDeaf = false;
        this.selfMute = false;
        this.voiceChannel = player.voiceChannel;
        this.lastUpdateTime = 0;
        this.updateThrottle = 1000; // Throttle time in milliseconds
    }

    setServerUpdate({ endpoint, token }: { endpoint: string; token: string }): void {
        if (!endpoint) throw new Error("Missing 'endpoint' property in VOICE_SERVER_UPDATE");

        const newRegion = endpoint.split('.')[0].replace(/[0-9]/g, "");
        if (this.region !== newRegion) {
            this.updateRegion(newRegion, endpoint, token);
        }
        this.updatePlayerVoiceData();
    }

    private updateRegion(newRegion: string, endpoint: string, token: string): void {
        const previousVoiceRegion = this.region;
        this.region = newRegion;
        this.voice.endpoint = endpoint;
        this.voice.token = token;

        const message = previousVoiceRegion
            ? `Changed Voice Region from ${previousVoiceRegion} to ${this.region}`
            : `Voice Server: ${this.region}`;

        this.player?.aqua.emit("debug", `[Player ${this.player.guildId} - CONNECTION] ${message}`);
    }

    setStateUpdate(data: { channel_id: string; session_id: string; self_deaf: boolean; self_mute: boolean }): void {
        if (!data.channel_id || !data.session_id) {
            this.cleanup();
            return;
        }

        if (this.voiceChannel !== data.channel_id) {
            this.player?.aqua.emit("playerMove", this.voiceChannel, data.channel_id);
            this.voiceChannel = data.channel_id;
        }

        this.selfDeaf = data.self_deaf;
        this.selfMute = data.self_mute;
        this.voice.sessionId = data.session_id;
    }

    private updatePlayerVoiceData(): void {
        const currentTime = Date.now();
        if (currentTime - this.lastUpdateTime >= this.updateThrottle) {
            this.lastUpdateTime = currentTime;

            const data = {
                voice: this.voice,
                volume: this.player?.volume,
            };

            this.player?.nodes.rest.updatePlayer({
                guildId: this.player.guildId,
                data,
            }).catch(err => {
                this.player?.aqua.emit("apiError", "updatePlayer", err);
            });
        }
    }

    cleanup(): void {
        this.player?.aqua.emit("playerLeave", this.player.voiceChannel);
        this.player?.destroy();
        this.player?.aqua.emit("playerDestroy", this.player);
        this.player = null;
        this.voice = { sessionId: null, endpoint: null, token: null };
        this.region = null;
        this.selfDeaf = false;
        this.selfMute = false;
        this.voiceChannel = null;
    }
}

export { Connection };
