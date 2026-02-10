/**
 * Minimal ID3v2 tag reader for extracting the title from MP3 files.
 * Works entirely in the browser using ArrayBuffer — no Node.js dependencies.
 */

export interface ID3Tags {
    title?: string;
    artist?: string;
    album?: string;
}

export async function readID3Tags(file: File): Promise<ID3Tags> {
    // Read first 10 bytes to check for ID3v2 header
    const headerSlice = file.slice(0, 10);
    const headerBuffer = await headerSlice.arrayBuffer();
    const headerUint8 = new Uint8Array(headerBuffer);

    // Check for ID3v2 header: "ID3"
    if (
        headerUint8[0] === 0x49 && // I
        headerUint8[1] === 0x44 && // D
        headerUint8[2] === 0x33    // 3
    ) {
        // Parse tag size (syncsafe integer)
        const tagSize = (
            ((headerUint8[6] & 0x7F) << 21) |
            ((headerUint8[7] & 0x7F) << 14) |
            ((headerUint8[8] & 0x7F) << 7) |
            (headerUint8[9] & 0x7F)
        );

        // Read the full tag (header + body)
        // ID3v2 size excludes the header itself (10 bytes), so add 10
        const fullTagSize = 10 + tagSize;
        const tagSlice = file.slice(0, fullTagSize);
        const tagBuffer = await tagSlice.arrayBuffer();

        return parseID3v2(new Uint8Array(tagBuffer), new DataView(tagBuffer));
    }

    // Check for ID3v1 at end of file (last 128 bytes)
    if (file.size >= 128) {
        const tailSlice = file.slice(file.size - 128);
        const tailBuffer = await tailSlice.arrayBuffer();
        const tailUint8 = new Uint8Array(tailBuffer);
        if (
            tailUint8[0] === 0x54 && // T
            tailUint8[1] === 0x41 && // A
            tailUint8[2] === 0x47    // G
        ) {
            return parseID3v1(tailUint8);
        }
    }

    return {};
}

function parseID3v1(data: Uint8Array): ID3Tags {
    const decoder = new TextDecoder('iso-8859-1');
    const title = decoder.decode(data.slice(3, 33)).replace(/\0+$/, '').trim();
    const artist = decoder.decode(data.slice(33, 63)).replace(/\0+$/, '').trim();
    const album = decoder.decode(data.slice(63, 93)).replace(/\0+$/, '').trim();
    return {
        title: title || undefined,
        artist: artist || undefined,
        album: album || undefined,
    };
}

// ID3v2
function parseID3v2(uint8: Uint8Array, view: DataView): ID3Tags {
    const version = uint8[3]; // Major version (3 = ID3v2.3, 4 = ID3v2.4, 2 = ID3v2.2)
    const flags = uint8[5];

    // Size is syncsafe integer (4 bytes, 7 bits each)
    const tagSize = (
        ((uint8[6] & 0x7F) << 21) |
        ((uint8[7] & 0x7F) << 14) |
        ((uint8[8] & 0x7F) << 7) |
        (uint8[9] & 0x7F)
    );

    console.log(`[ID3] Found ID3v2.${version} tag, size: ${tagSize}`);

    let offset = 10;
    const HEADER_SIZE = 10;

    // Skip extended header if present (v2.3/v2.4 only usually)
    if (version >= 3 && (flags & 0x40)) {
        const extSize = view.getUint32(offset);
        // v2.4 uses syncsafe for extended header size too, but v2.3 uses regular
        // For simplicity/robustness, we just skip it based on whatever the size says
        // But be careful: v2.4 syncsafe logic is complex.
        // For now assuming normal integer or syncsafe doesn't matter much for skipping relative to file size
        offset += extSize + 4;
    }

    const tags: ID3Tags = {};
    const end = Math.min(10 + tagSize, uint8.length);

    while (offset < end) {
        let frameId: string;
        let frameSize: number;
        let headerSize: number;

        if (version === 2) {
            // ID3v2.2: 3-char ID, 3-byte size
            if (offset + 6 > end) break;
            frameId = String.fromCharCode(uint8[offset], uint8[offset + 1], uint8[offset + 2]);

            // 3-byte size (Big Endian)
            frameSize = (
                (uint8[offset + 3] << 16) |
                (uint8[offset + 4] << 8) |
                uint8[offset + 5]
            );
            headerSize = 6;
        } else {
            // ID3v2.3/v2.4: 4-char ID, 4-byte size
            if (offset + 10 > end) break;
            frameId = String.fromCharCode(uint8[offset], uint8[offset + 1], uint8[offset + 2], uint8[offset + 3]);

            if (version === 4) {
                // ID3v2.4 size is syncsafe
                frameSize = (
                    ((uint8[offset + 4] & 0x7F) << 21) |
                    ((uint8[offset + 5] & 0x7F) << 14) |
                    ((uint8[offset + 6] & 0x7F) << 7) |
                    (uint8[offset + 7] & 0x7F)
                );
            } else {
                // ID3v2.3 size is standard integer
                frameSize = view.getUint32(offset + 4);
            }
            headerSize = 10;
        }

        // Check for padding (null bytes)
        if (frameId.charCodeAt(0) === 0) break;

        // Skip invalid frames
        if (frameSize <= 0 || offset + headerSize + frameSize > end) {
            console.warn(`[ID3] Invalid frame size ${frameSize} for frame ${frameId} at offset ${offset}. Remaining tag size: ${end - offset}`);
            break;
        }

        const frameData = uint8.slice(offset + headerSize, offset + headerSize + frameSize);

        // Map V2.2 IDs to V2.3/4 logic
        // v2.2: TT2 (Title), TP1 (Artist), TAL (Album)
        // v2.3/4: TIT2, TPE1, TALB

        let value: string | undefined;
        if (frameId === 'TIT2' || frameId === 'TT2') {
            value = decodeTextFrame(frameData);
            if (value) tags.title = value;
        } else if (frameId === 'TPE1' || frameId === 'TP1') {
            value = decodeTextFrame(frameData);
            if (value) tags.artist = value;
        } else if (frameId === 'TALB' || frameId === 'TAL') {
            value = decodeTextFrame(frameData);
            if (value) tags.album = value;
        }

        if (value) console.log(`[ID3] Found frame ${frameId}:`, value);

        offset += headerSize + frameSize;
    }

    return tags;
}

function decodeTextFrame(data: Uint8Array): string | undefined {
    if (data.length < 2) return undefined;

    const encoding = data[0];
    const textData = data.slice(1);

    let text: string;
    switch (encoding) {
        case 0: // ISO-8859-1
            text = new TextDecoder('iso-8859-1').decode(textData);
            break;
        case 1: // UTF-16 with BOM
            text = new TextDecoder('utf-16').decode(textData);
            break;
        case 2: // UTF-16BE without BOM
            text = new TextDecoder('utf-16be').decode(textData);
            break;
        case 3: // UTF-8
            text = new TextDecoder('utf-8').decode(textData);
            break;
        default:
            text = new TextDecoder('iso-8859-1').decode(textData);
    }

    // Remove null terminators and trim
    return text.replace(/\0+$/, '').trim() || undefined;
}
