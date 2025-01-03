import { request } from "undici";
import { EventEmitter } from "events"; // Assuming aqua extends EventEmitter

interface RestOptions {
    secure?: boolean;
    host: string;
    port: number;
    sessionId: string;
    password: string;
    restVersion?: string;
}

interface UpdatePlayerOptions {
    guildId: string;
    data: Record<string, any>; // Adjust the type according to your data structure
}

interface Track {
    encoded?: string;
    identifier?: string;
}

class Rest {
    private aqua: EventEmitter; // Assuming aqua is an EventEmitter
    private url: string;
    private sessionId: string;
    private password: string;
    private version: string;
    private calls: number;
    private headers: Record<string, string>;

    constructor(aqua: EventEmitter, options: RestOptions) {
        this.aqua = aqua;
        this.url = `http${options.secure ? "s" : ""}://${options.host}:${options.port}`;
        this.sessionId = options.sessionId;
        this.password = options.password;
        this.version = options.restVersion || "v4";
        this.calls = 0;
        this.headers = {
            "Content-Type": "application/json",
            Authorization: this.password,
        };
    }

    setSessionId(sessionId: string): void {
        this.sessionId = sessionId;
    }

    async makeRequest(method: string, endpoint: string, body: any = null): Promise<any> {
        const options: { method: string; headers: Record<string, string>; body?: string } = {
            method,
            headers: this.headers,
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const response = await request(`${this.url}${endpoint}`, options);
        this.calls++;
        const data = await response.body.json();
        this.aqua.emit("apiResponse", endpoint, {
            status: response.statusCode,
            headers: response.headers,
        });
        response.body.destroy();
        return data;
    }

    async updatePlayer(options: UpdatePlayerOptions): Promise<any> {
        const requestBody = { ...options.data };
        if ((requestBody.track?.encoded && requestBody.track?.identifier) ||
            (requestBody.encodedTrack && requestBody.identifier)) {
            throw new Error("Cannot provide both 'encoded' and 'identifier' for track");
        }
        if (this.version === "v3" && requestBody.track) {
            const { track } = requestBody;
            delete requestBody.track;
            requestBody[track.encoded ? 'encodedTrack' : 'identifier'] = track.encoded || track.identifier;
        }
        return this.makeRequest(
            "PATCH",
            `/${this.version}/sessions/${this.sessionId}/players/${options.guildId}?noReplace=false`,
            requestBody
        );
    }

    async getPlayers(): Promise<any> {
        return this.makeRequest("GET", `/${this.version}/sessions/${this.sessionId}/players`);
    }

    async destroyPlayer(guildId: string): Promise<any> {
        return this.makeRequest("DELETE", `/${this.version}/sessions/${this.sessionId}/players/${guildId}`);
    }

    async getTracks(identifier: string): Promise<any> {
        return this.makeRequest("GET", `/${this.version}/loadtracks?identifier=${encodeURIComponent(identifier)}`);
    }

    async decodeTrack(track: string): Promise<any> {
        return this.makeRequest("GET", `/${this.version}/decodetrack?encodedTrack=${encodeURIComponent(track)}`);
    }

    async decodeTracks(tracks: any): Promise<any> { // Adjust the type according to your data structure
        return this.makeRequest("POST", `/${this.version}/decodetracks`, tracks);
    }

    async getStats(): Promise<any> {
        return this.makeRequest("GET", `/${this.version}/stats${this.version !== "v3" ? "/all" : ""}`);
    }

    async getInfo(): Promise<any> {
        return this.makeRequest("GET", `/${this.version}/info`);
    }

    async getRoutePlannerStatus(): Promise<any> {
        return this.makeRequest("GET", `/${this.version}/routeplanner/status`);
    }

    async getRoutePlannerAddress(address: string): Promise<any> {
        return this.makeRequest("POST", `/${this.version}/routeplanner/free/address`, { address });
    }
}

export { Rest };