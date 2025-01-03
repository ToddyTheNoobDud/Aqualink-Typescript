import { EventEmitter } from "events";
import { Node } from "./Node";
import { Player } from "./Player";
import { Track } from "./Track";
import { version as pkgVersion } from "../package.json";

const URL_REGEX = /^https?:\/\//;

interface AquaOptions {
    shouldDeleteMessage?: boolean;
    defaultSearchPlatform?: string;
    restVersion?: string;
    plugins?: any[];
    send: (data: any) => void;
    autoResume?: boolean;
    idleTimeout?: number;
}

class Aqua extends EventEmitter {
    private client: any;
    private nodes: any[];
    private nodeMap: Map<string, Node>;
    private players: Map<string, Player>;
    private clientId: string | null;
    private initiated: boolean;
    private shouldDeleteMessage: boolean;
    private defaultSearchPlatform: string;
    private restVersion: string;
    private plugins: any[];
    private version: string;
    private options: AquaOptions;
    private send: (data: any) => void;
    private autoResume: boolean;

    constructor(client: any, nodes: any[], options: AquaOptions) {
        super();
        this.validateInputs(client, nodes, options);
        this.client = client;
        this.nodes = nodes;
        this.nodeMap = new Map();
        this.players = new Map();
        this.clientId = null;
        this.initiated = false;
        this.shouldDeleteMessage = options.shouldDeleteMessage || false;
        this.defaultSearchPlatform = options.defaultSearchPlatform || "ytsearch";
        this.restVersion = options.restVersion || "v4";
        this.plugins = options.plugins || [];
        this.version = pkgVersion;
        this.options = options;
        this.send = options.send;
        this.autoResume = options.autoResume || false;
        this.setMaxListeners(0);
    }

    private validateInputs(client: any, nodes: any[], options: AquaOptions): void {
        if (!client) throw new Error("Client is required to initialize Aqua");
        if (!Array.isArray(nodes) || !nodes.length) throw new Error(`Nodes must be a non-empty Array (Received ${typeof nodes})`);
        if (typeof options?.send !== "function") throw new Error("Send function is required to initialize Aqua");
    }

    private get leastUsedNodes(): Node[] {
        const activeNodes = [...this.nodeMap.values()].filter(node => node.connected);
        return activeNodes.length ? activeNodes.sort((a, b) => a.rest.calls - b.rest.calls) : [];
    }

    public init(clientId: string): this {
        if (this.initiated) return this;
        this.clientId = clientId;
        try {
            this.nodes.forEach(nodeConfig => this.createNode(nodeConfig));
            this.initiated = true;
            this.plugins.forEach(plugin => plugin.load(this));
        } catch (error) {
            this.initiated = false;
            throw error;
        }
        return this;
    }

    private createNode(options: any): Node {
        const nodeId = options.name || options.host;
        this.destroyNode(nodeId); // Ensure no duplicate nodes
        const node = new Node(this, options, this.options);
        this.nodeMap.set(nodeId, node);
        try {
            node.connect();
            this.emit("nodeCreate", node);
            return node;
        } catch (error) {
            this.nodeMap.delete(nodeId);
            throw error;
        }
    }

    private destroyNode(identifier: string): void {
        const node = this.nodeMap.get(identifier);
        if (!node) return;
        try {
            node.disconnect();
            node.removeAllListeners();
            this.nodeMap.delete(identifier);
            this.emit("nodeDestroy", node);
        } catch (error) {
            console.error(`Error destroying node ${identifier}:`, error);
        }
    }

    public updateVoiceState({ d, t }: { d: any; t: string }): void {
        const player = this.players.get(d.guild_id);
        if (player && (t === "VOICE_SERVER_UPDATE" || (t === "VOICE_STATE_UPDATE" && d.user_id === this.clientId))) {
            player.connection[t === "VOICE_SERVER_UPDATE" ? "setServerUpdate" : "setStateUpdate"](d);
            if (d.status === "disconnected") this.cleanupPlayer(player);
        }
    }

    public fetchRegion(region?: string): Node[] {
        if (!region) return this.leastUsedNodes;
        const lowerRegion = region.toLowerCase();
        const eligibleNodes = [...this.nodeMap.values()].filter(node => node.connected && node.regions?.includes(lowerRegion));
        return eligibleNodes.sort((a, b) => this.calculateLoad(a) - this.calculateLoad(b));
    }

    private calculateLoad(node: Node): number {
        if (!node?.stats?.cpu) return 0;
        const { systemLoad, cores } = node.stats.cpu;
        return (systemLoad / cores) * 100;
    }

    public createConnection(options: { guildId: string; region?: string }): Player {
        this.ensureInitialized();
        const player = this.players.get(options.guildId);
        if (player && player.voiceChannel) return player;
        const node = options.region ? this.fetchRegion(options.region)[0] : this.leastUsedNodes[0];
        if (!node) throw new Error("No nodes are available");
        return this.createPlayer(node, options);
    }

    private createPlayer(node: Node, options: { guildId: string }): Player {
        this.destroyPlayer(options.guildId);
        const player = new Player(this, node, options);
        this.players.set(options.guildId, player);
        player.once("destroy", () => this.cleanupPlayer(player));
        player.connect(options);
        this.emit("playerCreate", player);
        return player;
    }

    private destroyPlayer(guildId: string): void {
        const player = this.players.get(guildId);
        if (!player) return;
        try {
            player.clearData();
            player.removeAllListeners();
            player.destroy();
            this.players.delete(guildId);
            this.emit("playerDestroy", player);
        } catch (error) {
            console.error(`Error destroying player for guild ${guildId}:`, error);
        }
    }

    public async resolve({ query, source = this.defaultSearchPlatform, requester, nodes }: { query: string; source?: string; requester: any; nodes?: string | Node }): Promise<any> {
        this.ensureInitialized();
        const requestNode = this.getRequestNode(nodes);
        const formattedQuery = this.formatQuery(query, source);
        try {
            const response = await requestNode.rest.makeRequest("GET", `/v4/loadtracks?identifier=${encodeURIComponent(formattedQuery)}`);
            if (["empty", "NO_MATCHES"].includes(response.loadType)) {
                return await this.handleNoMatches(requestNode.rest, query);
            }
            return this.constructorResponse(response, requester, requestNode);
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error("Request timed out");
            }
            throw new Error(`Failed to resolve track: ${error.message}`);
        }
    }

    private getRequestNode(nodes?: string | Node): Node {
        if (nodes && !(typeof nodes === "string" || nodes instanceof Node)) {
            throw new TypeError(`'nodes' must be a string or Node instance, received: ${typeof nodes}`);
        }
        return (typeof nodes === 'string' ? this.nodeMap.get(nodes) : nodes) ?? this.leastUsedNodes[0];
    }

    private ensureInitialized(): void {
        if (!this.initiated) throw new Error("Aqua must be initialized before this operation");
    }

    private formatQuery(query: string, source: string): string {
        return URL_REGEX.test(query) ? query : `${source}:${query}`;
    }

    private async handleNoMatches(rest: any, query: string): Promise<any> {
        try {
            const youtubeResponse = await rest.makeRequest("GET", `/v4/loadtracks?identifier=https://www.youtube.com/watch?v=${query}`);
            if (["empty", "NO_MATCHES"].includes(youtubeResponse.loadType)) {
                return await rest.makeRequest("GET", `/v4/loadtracks?identifier=https://open.spotify.com/track/${query}`);
            }
            return youtubeResponse;
        } catch (error) {
            console.error(`Failed to resolve track: ${error.message}`);
        }
    }

    private constructorResponse(response: any, requester: any, requestNode: Node): any {
        const baseResponse = {
            loadType: response.loadType,
            exception: null,
            playlistInfo: null,
            pluginInfo: response.pluginInfo ?? {},
            tracks: [],
        };
        if (response.loadType === "error" || response.loadType === "LOAD_FAILED") {
            baseResponse.exception = response.data ?? response.exception;
            return baseResponse;
        }
        const trackFactory = (trackData: any) => new Track(trackData, requester, requestNode);
        switch (response.loadType) {
            case "track":
                if (response.data) {
                    baseResponse.tracks.push(trackFactory(response.data));
                }
                break;
            case "playlist":
                if (response.data?.info) {
                    baseResponse.playlistInfo = {
                        name: response.data.info.name ?? response.data.info.title,
                        ...response.data.info,
                    };
                }
                baseResponse.tracks = (response.data?.tracks ?? []).map(trackFactory);
                break;
            case "search":
                baseResponse.tracks = (response.data ?? []).map(trackFactory);
                break;
        }
        return baseResponse;
    }

    public get(guildId: string): Player {
        const player = this.players.get(guildId);
        if (!player) throw new Error(`Player not found for guild ID: ${guildId}`);
        return player;
    }

    public cleanupIdle(): void {
        const now = Date.now();
        for (const [guildId, player] of this.players) {
            if (!player.playing && !player.paused && player.queue.isEmpty() && (now - player.lastActivity) > (this.options.idleTimeout || 60000)) {
                this.cleanupPlayer(player);
            }
        }
    }

    private cleanupPlayer(player: Player): void {
        if (!player) return;
        try {
            player.clearData();
            player.removeAllListeners();
            player.destroy();
            this.players.delete(player.guildId);
            this.emit("playerDestroy", player);
        } catch (error) {
            console.error(`Error during player cleanup: ${error.message}`);
        }
    }

    public cleanup(): void {
        for (const player of this.players.values()) {
            this.cleanupPlayer(player);
        }
        for (const node of this.nodeMap.values()) {
            this.destroyNode(node.name || node.host);
        }
        this.nodeMap.clear();
        this.players.clear();
        this.client = null;
        this.nodes = null;
        this.plugins?.forEach(plugin => plugin.unload?.(this));
        this.plugins = null;
        this.options = null;
        this.send = null;
        this.version = null;
        this.removeAllListeners();
    }
}

export { Aqua };