interface KaraokeOptions {
    level?: number;
    monoLevel?: number;
    filterBand?: number;
    filterWidth?: number;
}

interface TimescaleOptions {
    speed?: number;
    pitch?: number;
    rate?: number;
}

interface TremoloOptions {
    frequency?: number;
    depth?: number;
}

interface VibratoOptions {
    frequency?: number;
    depth?: number;
}

interface RotationOptions {
    rotationHz?: number;
}

interface DistortionOptions {
    sinOffset?: number;
    sinScale?: number;
    cosOffset?: number;
    cosScale?: number;
    tanOffset?: number;
    tanScale?: number;
    offset?: number;
    scale?: number;
}

interface ChannelMixOptions {
    leftToLeft?: number;
    leftToRight?: number;
    rightToLeft?: number;
    rightToRight?: number;
}

interface LowPassOptions {
    smoothing?: number;
}

interface BassboostOptions {
    value?: number;
}

interface FilterOptions {
    volume?: number;
    equalizer?: Array<{ band: number; gain: number }>;
    karaoke?: KaraokeOptions | null;
    timescale?: TimescaleOptions | null;
    tremolo?: TremoloOptions | null;
    vibrato?: VibratoOptions | null;
    rotation?: RotationOptions | null;
    distortion?: DistortionOptions | null;
    channelMix?: ChannelMixOptions | null;
    lowPass?: LowPassOptions | null;
    bassboost?: BassboostOptions | null;
    slowmode?: boolean | null;
    nightcore?: boolean | null;
    vaporwave?: boolean | null;
    _8d?: boolean | null;
}

class Filters {
    player: any; // Replace `any` with the actual type of `player`
    volume: number;
    equalizer: Array<{ band: number; gain: number }>;
    karaoke: KaraokeOptions | null;
    timescale: TimescaleOptions | null;
    tremolo: TremoloOptions | null;
    vibrato: VibratoOptions | null;
    rotation: RotationOptions | null;
    distortion: DistortionOptions | null;
    channelMix: ChannelMixOptions | null;
    lowPass: LowPassOptions | null;
    bassboost: BassboostOptions | null;
    slowmode: boolean | null;
    nightcore: boolean | null;
    vaporwave: boolean | null;
    _8d: boolean | null;

    constructor(player: any, options: FilterOptions = {}) {
        this.player = player;
        this.volume = options.volume ?? 1;
        this.equalizer = options.equalizer ?? [];
        this.karaoke = options.karaoke ?? null;
        this.timescale = options.timescale ?? null;
        this.tremolo = options.tremolo ?? null;
        this.vibrato = options.vibrato ?? null;
        this.rotation = options.rotation ?? null;
        this.distortion = options.distortion ?? null;
        this.channelMix = options.channelMix ?? null;
        this.lowPass = options.lowPass ?? null;
        this.bassboost = options.bassboost ?? null;
        this.slowmode = options.slowmode ?? null;
        this.nightcore = options.nightcore ?? null;
        this.vaporwave = options.vaporwave ?? null;
        this._8d = options._8d ?? null;
    }

    setEqualizer(bands: Array<{ band: number; gain: number }>): Promise<this> {
        this.equalizer = bands;
        return this.updateFilters();
    }

    setKaraoke(enabled: boolean, options: KaraokeOptions = {}): Promise<this> {
        this.karaoke = enabled ? {
            level: options.level ?? 1.0,
            monoLevel: options.monoLevel ?? 1.0,
            filterBand: options.filterBand ?? 220.0,
            filterWidth: options.filterWidth ?? 100.0
        } : null;
        return this.updateFilters();
    }

    setTimescale(enabled: boolean, options: TimescaleOptions = {}): Promise<this> {
        this.timescale = enabled ? {
            speed: options.speed ?? 1.0,
            pitch: options.pitch ?? 1.0,
            rate: options.rate ?? 1.0
        } : null;
        return this.updateFilters();
    }

    setTremolo(enabled: boolean, options: TremoloOptions = {}): Promise<this> {
        this.tremolo = enabled ? {
            frequency: options.frequency ?? 2.0,
            depth: options.depth ?? 0.5
        } : null;
        return this.updateFilters();
    }

    setVibrato(enabled: boolean, options: VibratoOptions = {}): Promise<this> {
        this.vibrato = enabled ? {
            frequency: options.frequency ?? 2.0,
            depth: options.depth ?? 0.5
        } : null;
        return this.updateFilters();
    }

    setRotation(enabled: boolean, options: RotationOptions = {}): Promise<this> {
        this.rotation = enabled ? {
            rotationHz: options.rotationHz ?? 0.0
        } : null;
        return this.updateFilters();
    }

    setDistortion(enabled: boolean, options: DistortionOptions = {}): Promise<this> {
        this.distortion = enabled ? {
            sinOffset: options.sinOffset ?? 0.0,
            sinScale: options.sinScale ?? 1.0,
            cosOffset: options.cosOffset ?? 0.0,
            cosScale: options.cosScale ?? 1.0,
            tanOffset: options.tanOffset ?? 0.0,
            tanScale: options.tanScale ?? 1.0,
            offset: options.offset ?? 0.0,
            scale: options.scale ?? 1.0
        } : null;
        return this.updateFilters();
    }

    setChannelMix(enabled: boolean, options: ChannelMixOptions = {}): Promise<this> {
        this.channelMix = enabled ? {
            leftToLeft: options.leftToLeft ?? 1.0,
            leftToRight: options.leftToRight ?? 0.0,
            rightToLeft: options.rightToLeft ?? 0.0,
            rightToRight: options.rightToRight ?? 1.0
        } : null;
        return this.updateFilters();
    }

    setLowPass(enabled: boolean, options: LowPassOptions = {}): Promise<this> {
        this.lowPass = enabled ? {
            smoothing: options.smoothing ?? 20.0
        } : null;
        return this.updateFilters();
    }

    setBassboost(enabled: boolean, options: BassboostOptions = {}): Promise<this> {
        if (enabled) {
            const value = options.value ?? 5;
            if (value < 0 || value > 5) throw new Error("Bassboost value must be between 0 and 5");
            this.bassboost = null;
            const num = (value - 1) * (1.25 / 9) - 0.25;
            return this.setEqualizer(Array(13).fill(0).map((_, i) => ({
                band: i,
                gain: num
            })));
        }
        this.bassboost = null;
        return this.setEqualizer([]);
    }

    setSlowmode(enabled: boolean, options: { rate?: number } = {}): Promise<this> {
        this.slowmode = enabled;
        return this.setTimescale(enabled, { rate: enabled ? options.rate ?? 0.8 : 1.0 });
    }

    setNightcore(enabled: boolean, options: { rate?: number } = {}): Promise<this> {
        this.nightcore = enabled;
        if (enabled) {
            return this.setTimescale(true, { rate: options.rate ?? 1.5 });
        }
        return this.setTimescale(false);
    }

    setVaporwave(enabled: boolean, options: { pitch?: number } = {}): Promise<this> {
        this.vaporwave = enabled;
        if (enabled) {
            return this.setTimescale(true, { pitch: options.pitch ?? 0.5 });
        }
        return this.setTimescale(false);
    }

    set8D(enabled: boolean, options: { rotationHz?: number } = {}): Promise<this> {
        this._8d = enabled;
        return this.setRotation(enabled, { rotationHz: enabled ? options.rotationHz ?? 0.2 : 0.0 });
    }

    async clearFilters(): Promise<this> {
        Object.assign(this, new Filters(this.player));
        await this.updateFilters();
        return this;
    }

    async updateFilters(): Promise<this> {
        const filterData = {
            volume: this.volume,
            equalizer: this.equalizer,
            karaoke: this.karaoke,
            timescale: this.timescale,
            tremolo: this.tremolo,
            vibrato: this.vibrato,
            rotation: this.rotation,
            distortion: this.distortion,
            channelMix: this.channelMix,
            lowPass: this.lowPass
        };
        await this.player.nodes.rest.updatePlayer({
            guildId: this.player.guildId,
            data: { filters: filterData }
        });
        return this;
    }
}

export { Filters };