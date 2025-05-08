import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { request as httpsRequest } from "https";
import { request } from "http";
import net from "net";

function decodeBencode(bencodedValue: string): any {
  function parse(index: number): [any, number] | any {
    const char = bencodedValue[index];

    switch (char) {
      case "i": {
        const end = bencodedValue.indexOf("e", index);
        const number = parseInt(bencodedValue.substring(index + 1, end));
        return [number, end + 1];
      }
      case "l": {
        const list: any[] = [];
        index++;
        while (bencodedValue[index] !== "e") {
          const [value, nextIndex] = parse(index);
          list.push(value);
          index = nextIndex;
        }
        return [list, index + 1];
      }
      case "d": {
        const dict: Record<string, any> = {};
        index++;
        while (bencodedValue[index] !== "e") {
          const [key, keyIndex] = parse(index);
          if (typeof key !== "string") {
            throw new Error(`Invalid key of index ${index}, must be string`);
          }
          const [value, nextIndex] = parse(keyIndex);
          dict[key] = value;
          index = nextIndex;
        }
        return [dict, index + 1];
      }
      default: {
        if (/\d/.test(char)) {
          const colon = bencodedValue.indexOf(":", index);
          const length = parseInt(bencodedValue.substring(index, colon));
          const start = colon + 1;
          const end = start + length;
          const str = bencodedValue.substring(start, end);
          return [str, end];
        } else {
          throw new Error(`Unexpected character: ${char}`);
        }
      }
    }
  }
  const [result] = parse(0);
  return result;
}

const args = process.argv;
const command = args[2];
const input = args[3];

if (command === "decode") {
  try {
    const decode = decodeBencode(input);
    console.log(JSON.stringify(decode));
  } catch (e) {
    console.error("error decode", e);
  }
} else if (command === "info") {
  try {
    const fileBuffer = readFileSync(input);
    const fileString = fileBuffer.toString("binary");
    const torrent = decodeBencode(fileString);
    const anounce = torrent["announce"];
    const length = torrent["info"]?.["length"];
    const pieceLength = torrent["info"]?.["piece length"];
    const pieces = torrent["info"]?.["pieces"];

    const infoKey = "4:info";
    const infoStart = fileString.indexOf(infoKey) + infoKey.length;
    function findInfoEnd(index: number): number {
      let stack = [];
      while (index < fileString.length) {
        const char = fileString[index];
        if (char === "d" || char === "l") {
          stack.push(char);
          index++;
        } else if (char === "e") {
          stack.pop();
          index++;
          if (stack.length === 0) break;
        } else if (char === "i") {
          const end = fileString.indexOf("e", index);
          index = end + 1;
        } else if (/\d/.test(char)) {
          const colon = fileString.indexOf(":", index);
          const len = parseInt(fileString.substring(index, colon));
          index = colon + 1 + len;
        } else {
          throw new Error(
            `Unexpected character '${char}' at position ${index}`
          );
        }
      }
      return index;
    }
    const infoEnd = findInfoEnd(infoStart);
    const infoByteStart = Buffer.byteLength(
      fileString.substring(0, infoStart),
      "binary"
    );
    const infoByteEnd = Buffer.byteLength(
      fileString.substring(0, infoEnd),
      "binary"
    );

    const infoBuffer = fileBuffer.subarray(infoByteStart, infoByteEnd);
    const infoHash = createHash("sha1").update(infoBuffer).digest("hex");

    console.log(`Tracker URL: ${anounce}`);
    console.log(`Length: ${length}`);
    console.log(`Info Hash: ${infoHash}`);
    console.log(`Piece Length: ${pieceLength}`);
    console.log(`Pieces Hash:`);

    const pieceBuffer = Buffer.from(pieces, "binary");
    for (let i = 0; i < pieceBuffer.length; i += 20) {
      const pieceHash = pieceBuffer.subarray(i, i + 20);
      console.log(pieceHash.toString("hex"));
    }
  } catch (e) {
    console.error("error info", e);
  }
} else if (command === "peers") {
  try {
    const fileBuffer = readFileSync(input);
    const fileString = fileBuffer.toString("binary");
    const torrent = decodeBencode(fileString);

    const announce: string = torrent["announce"];
    const length: number = torrent["info"]?.["length"];

    const infoKey = "4:info";
    const infoStart = fileString.indexOf(infoKey) + infoKey.length;

    function findInfoEnd(index: number): number {
      const stack: string[] = [];
      while (index < fileString.length) {
        const char = fileString[index];
        if (char === "d" || char === "l") {
          stack.push(char);
          index++;
        } else if (char === "e") {
          stack.pop();
          index++;
          if (stack.length === 0) break;
        } else if (char === "i") {
          const end = fileString.indexOf("e", index);
          index = end + 1;
        } else if (/\d/.test(char)) {
          const colon = fileString.indexOf(":", index);
          const len = parseInt(fileString.substring(index, colon), 10);
          index = colon + 1 + len;
        } else {
          throw new Error(
            `Unexpected character '${char}' at position ${index}`
          );
        }
      }
      return index;
    }

    const infoEnd = findInfoEnd(infoStart);
    const infoByteStart = Buffer.byteLength(
      fileString.substring(0, infoStart),
      "binary"
    );
    const infoByteEnd = Buffer.byteLength(
      fileString.substring(0, infoEnd),
      "binary"
    );

    const infoBuffer = fileBuffer.subarray(infoByteStart, infoByteEnd);
    const infoHashBinary = createHash("sha1").update(infoBuffer).digest();

    const infoHashEncoded = Array.from(infoHashBinary)
      .map((b) => `%${b.toString(16).padStart(2, "0")}`)
      .join("");

    const peerId =
      "-PC0001-" + Math.random().toString(36).substring(2, 14).padEnd(12, "0");

    const query =
      `info_hash=${infoHashEncoded}` +
      `&peer_id=${encodeURIComponent(peerId)}` +
      `&port=6881` +
      `&uploaded=0` +
      `&downloaded=0` +
      `&left=${length}` +
      `&compact=1`;

    const url = `${announce}?${query}`;

    const client = url.startsWith("https:") ? httpsRequest : request;

    const req = client(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const response = Buffer.concat(chunks).toString("latin1");
        const decoded = decodeBencode(response);

        if (!decoded["peers"]) {
          console.error("No peers received:", decoded);
          return;
        }

        const peersBuffer = Buffer.from(decoded["peers"], "latin1");

        for (let i = 0; i < peersBuffer.length; i += 6) {
          const ip = `${peersBuffer[i]}.${peersBuffer[i + 1]}.${
            peersBuffer[i + 2]
          }.${peersBuffer[i + 3]}`;
          const port = peersBuffer.readUInt16BE(i + 4);
          console.log(`${ip}:${port}`);
        }
      });
    });

    req.on("error", (e) => {
      console.error("Request error:", e);
    });

    req.end();
  } catch (e) {
    console.error("Error:", e);
  }
} else if (command === "handshake") {
  try {
    const [torrentPath, peerAddress] = [args[3], args[4]];
    const [peerHost, peerPort] = peerAddress.split(":");

    const fileBuffer = readFileSync(torrentPath);
    const fileString = fileBuffer.toString("binary");
    const torrent = decodeBencode(fileString);
    const length = torrent["info"]?.["length"];

    const infoKey = "4:info";
    const infoStart = fileString.indexOf(infoKey) + infoKey.length;

    function findInfoEnd(index: number): number {
      const stack: string[] = [];
      while (index < fileString.length) {
        const char = fileString[index];
        if (char === "d" || char === "l") {
          stack.push(char);
          index++;
        } else if (char === "e") {
          stack.pop();
          index++;
          if (stack.length === 0) break;
        } else if (char === "i") {
          const end = fileString.indexOf("e", index);
          index = end + 1;
        } else if (/\d/.test(char)) {
          const colon = fileString.indexOf(":", index);
          const len = parseInt(fileString.substring(index, colon));
          index = colon + 1 + len;
        } else {
          throw new Error(
            `Unexpected character '${char}' at position ${index}`
          );
        }
      }
      return index;
    }

    const infoEnd = findInfoEnd(infoStart);
    const infoByteStart = Buffer.byteLength(
      fileString.substring(0, infoStart),
      "binary"
    );
    const infoByteEnd = Buffer.byteLength(
      fileString.substring(0, infoEnd),
      "binary"
    );

    const infoBuffer = fileBuffer.subarray(infoByteStart, infoByteEnd);
    const infoHash = createHash("sha1").update(infoBuffer).digest();

    const peerId = Buffer.alloc(20);
    for (let i = 0; i < 20; i++) peerId[i] = Math.floor(Math.random() * 256);

    const socket = new net.Socket();

    socket.connect(parseInt(peerPort), peerHost, () => {
      const pstr = "BitTorrent protocol";
      const handshake = Buffer.alloc(68);
      handshake.writeUInt8(pstr.length, 0);
      handshake.write(pstr, 1);
      infoHash.copy(handshake, 28);
      peerId.copy(handshake, 48);

      socket.write(handshake);
    });

    socket.on("data", (data: Buffer) => {
      if (data.length < 68) {
        console.error("Incomplete handshake");
        socket.destroy();
        return;
      }

      const receivedPeerId = data.subarray(48, 68);
      console.log(`Peer ID: ${receivedPeerId.toString("hex")}`);
      socket.destroy();
    });

    socket.on("error", (err) => {
      console.error("Socket error:", err.message);
    });
  } catch (e) {
    console.error("Handshake error:", e);
  }
} else if (command === "download_piece") {
  try {
    const outputPath = args[4];
    const torrentPath = args[5];
    const pieceIndex = parseInt(args[6]);

    if (isNaN(pieceIndex)) {
        throw new Error("Invalid piece index");
    }

    const fileBuffer = readFileSync(torrentPath);
    const fileString = fileBuffer.toString("binary");
    const torrent = decodeBencode(fileString);
    const announce = torrent["announce"];
    const info = torrent["info"];
    const pieceLength = info["piece length"];
    const pieces = info["pieces"];
    const totalLength = info["length"];

    const infoKey = "4:info";
    const infoStart = fileString.indexOf(infoKey) + infoKey.length;

    function findInfoEnd(index: number): number {
      const stack: string[] = [];
      while (index < fileString.length) {
        const char = fileString[index];
        if (char === "d" || char === "l") {
          stack.push(char);
          index++;
        } else if (char === "e") {
          stack.pop();
          index++;
          if (stack.length === 0) break;
        } else if (char === "i") {
          const end = fileString.indexOf("e", index);
          index = end + 1;
        } else if (/\d/.test(char)) {
          const colon = fileString.indexOf(":", index);
          const len = parseInt(fileString.substring(index, colon));
          index = colon + 1 + len;
        } else {
          throw new Error(`Unexpected character '${char}' at ${index}`);
        }
      }
      return index;
    }

    const infoEnd = findInfoEnd(infoStart);
    const infoByteStart = Buffer.byteLength(
      fileString.substring(0, infoStart),
      "binary"
    );
    const infoByteEnd = Buffer.byteLength(
      fileString.substring(0, infoEnd),
      "binary"
    );
    const infoBuffer = fileBuffer.subarray(infoByteStart, infoByteEnd);
    const infoHash = createHash("sha1").update(infoBuffer).digest();

    const infoHashEncoded = Array.from(infoHash)
      .map((b) => `%${b.toString(16).padStart(2, "0")}`)
      .join("");

    const peerIdStr =
      "-PC0001-" + Math.random().toString(36).substring(2, 14).padEnd(12, "0");
    const peerId = Buffer.from(peerIdStr, "utf-8");

    const query =
      `info_hash=${infoHashEncoded}` +
      `&peer_id=${encodeURIComponent(peerIdStr)}` +
      `&port=6881` +
      `&uploaded=0` +
      `&downloaded=0` +
      `&left=${totalLength}` +
      `&compact=1`;

    const url = `${announce}?${query}`;
    const client = url.startsWith("https:") ? httpsRequest : request;

    const req = client(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const response = Buffer.concat(chunks).toString("latin1");
        let decoded: any;

        try {
          decoded = decodeBencode(response);
          console.log("Tracker response (decoded):", decoded);
          if (decoded["failure reason"]) {
            console.error("Tracker failure:", decoded["failure reason"]);
            return;
          }
        } catch (e) {
          console.error("Failed to decode tracker response");
          return;
        }

        const peersRaw = decoded["peers"];
        const peersBuffer = Buffer.from(peersRaw, "binary");

        if (peersBuffer.length < 6) {
          console.error("Invalid peer data");
          return;
        }

        const ip = `${peersBuffer[0]}.${peersBuffer[1]}.${peersBuffer[2]}.${peersBuffer[3]}`;
        const port = peersBuffer.readUInt16BE(4);
        const socket = new net.Socket();

        const BLOCK_LEN = 16 * 1024;
        const pieceOffset = pieceIndex * pieceLength;
        const lastPieceLength = Math.min(
          pieceLength,
          totalLength - pieceOffset
        );
        const numBlocks = Math.ceil(lastPieceLength / BLOCK_LEN);
        const blocks: (Buffer | undefined)[] = new Array(numBlocks).fill(
          undefined
        );

        const handshake = Buffer.alloc(68);
        const pstr = "BitTorrent protocol";
        handshake.writeUInt8(pstr.length, 0);
        handshake.write(pstr, 1);
        infoHash.copy(handshake, 28);
        peerId.copy(handshake, 48);

        socket.setTimeout(10000, () => {
          console.error("Socket timeout");
          socket.destroy();
        });

        socket.connect(port, ip, () => {
          socket.write(handshake);
        });

        let stage = "handshake";
        let buffer = Buffer.alloc(0);

        socket.on("data", (data: Buffer) => {
          buffer = Buffer.concat([buffer, data]);

          if (stage === "handshake" && buffer.length >= 68) {
            const receivedInfoHash = buffer.subarray(28, 48);
            if (!receivedInfoHash.equals(infoHash)) {
              console.error("InfoHash mismatch");
              socket.destroy();
              return;
            }
            stage = "bitfield";
            buffer = buffer.subarray(68);
          }

          while (buffer.length >= 4) {
            const length = buffer.readUInt32BE(0);
            if (buffer.length < 4 + length) break;

            const id = buffer[4];
            const payload = buffer.subarray(5, 4 + length);

            if (id === 5 && stage === "bitfield") {
              socket.write(Buffer.from([0, 0, 0, 1, 2])); 
              stage = "interested";
            } else if (id === 1 && stage === "interested") {
              stage = "unchoked";
              for (let i = 0; i < numBlocks; i++) {
                const begin = i * BLOCK_LEN;
                const reqLen =
                  i === numBlocks - 1 ? lastPieceLength - begin : BLOCK_LEN;
                const request = Buffer.alloc(17);
                request.writeUInt32BE(13, 0);
                request.writeUInt8(6, 4); 
                request.writeUInt32BE(pieceIndex, 5);
                request.writeUInt32BE(begin, 9);
                request.writeUInt32BE(reqLen, 13);
                socket.write(request);
              }
            } else if (id === 7 && stage === "unchoked") {
            //   const pieceIdx = payload.readUInt32BE(0);
              const begin = payload.readUInt32BE(4);
              const block = payload.subarray(8);
              const blockIndex = Math.floor(begin / BLOCK_LEN);

              if (blockIndex >= 0 && blockIndex < numBlocks) {
                blocks[blockIndex] = block;
              }

              const missingBlocks = blocks
                .map((b, i) => (b instanceof Buffer ? null : i))
                .filter((i) => i !== null) as number[];

              if (missingBlocks.length === 0) {
                const piece = Buffer.concat(blocks as Buffer[]);
                const hash = createHash("sha1").update(piece).digest("hex");
                const expected = Buffer.from(pieces, "binary")
                  .subarray(pieceIndex * 20, (pieceIndex + 1) * 20)
                  .toString("hex");

                if (hash !== expected) {
                  console.error("Piece hash mismatch");
                } else {
                  writeFileSync(outputPath, piece);
                  console.log("Piece saved:", outputPath);
                }
                socket.destroy();
              } else {
                console.warn(
                  `Still waiting for blocks: ${missingBlocks.join(", ")}`
                );
              }
            }

            buffer = buffer.subarray(4 + length);
          }
        });

        socket.on("error", (e) => {
          console.error("Socket error:", e);
        });
      });
    });

    req.on("error", (e) => {
      console.error("Tracker request error:", e);
    });

    req.end();
  } catch (e) {
    console.error("Download error:", e);
  }
}else if (command === "download") {
    try {
      const outputPath = args[4];
      const torrentPath = args[5];
  
      const fileBuffer = readFileSync(torrentPath);
      const fileString = fileBuffer.toString("binary");
      const torrent = decodeBencode(fileString);
      const announce = torrent["announce"];
      const info = torrent["info"];
      const pieceLength = info["piece length"];
      const pieces = info["pieces"];
      const totalLength = info["length"];
  
      const infoKey = "4:info";
      const infoStart = fileString.indexOf(infoKey) + infoKey.length;
  
      function findInfoEnd(index: number): number {
        const stack: string[] = [];
        while (index < fileString.length) {
          const char = fileString[index];
          if (char === "d" || char === "l") {
            stack.push(char);
            index++;
          } else if (char === "e") {
            stack.pop();
            index++;
            if (stack.length === 0) break;
          } else if (char === "i") {
            const end = fileString.indexOf("e", index);
            index = end + 1;
          } else if (/\d/.test(char)) {
            const colon = fileString.indexOf(":", index);
            const len = parseInt(fileString.substring(index, colon));
            index = colon + 1 + len;
          } else {
            throw new Error(`Unexpected character '${char}' at ${index}`);
          }
        }
        return index;
      }
  
      const infoEnd = findInfoEnd(infoStart);
      const infoByteStart = Buffer.byteLength(fileString.substring(0, infoStart), "binary");
      const infoByteEnd = Buffer.byteLength(fileString.substring(0, infoEnd), "binary");
      const infoBuffer = fileBuffer.subarray(infoByteStart, infoByteEnd);
      const infoHash = createHash("sha1").update(infoBuffer).digest();
      const infoHashEncoded = Array.from(infoHash).map((b) => `%${b.toString(16).padStart(2, "0")}`).join("");
  
      const peerIdStr = "-PC0001-" + Math.random().toString(36).substring(2, 14).padEnd(12, "0");
      const peerId = Buffer.from(peerIdStr, "utf-8");
  
      const query = `info_hash=${infoHashEncoded}&peer_id=${encodeURIComponent(peerIdStr)}&port=6881&uploaded=0&downloaded=0&left=${totalLength}&compact=1`;
  
      const url = `${announce}?${query}`;
      const client = url.startsWith("https:") ? httpsRequest : request;
  
      const req = client(url, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const response = Buffer.concat(chunks).toString("latin1");
          let decoded: any;
  
          try {
            decoded = decodeBencode(response);
            if (decoded["failure reason"]) {
              console.error("Tracker failure:", decoded["failure reason"]);
              return;
            }
          } catch {
            console.error("Failed to decode tracker response");
            return;
          }
  
          const peersRaw = decoded["peers"];
          const peersBuffer = Buffer.from(peersRaw, "binary");
  
          if (peersBuffer.length < 6) {
            console.error("Invalid peer data");
            return;
          }
  
          const ip = `${peersBuffer[0]}.${peersBuffer[1]}.${peersBuffer[2]}.${peersBuffer[3]}`;
          const port = peersBuffer.readUInt16BE(4);
          const socket = new net.Socket();
  
          const BLOCK_LEN = 16 * 1024;
          const numPieces = Math.ceil(totalLength / pieceLength);
          const pieceHashes = Buffer.from(pieces, "binary");
          const fileData: Buffer[] = new Array(numPieces);
          let downloaded = 0;
  
          const handshake = Buffer.alloc(68);
          const pstr = "BitTorrent protocol";
          handshake.writeUInt8(pstr.length, 0);
          handshake.write(pstr, 1);
          infoHash.copy(handshake, 28);
          peerId.copy(handshake, 48);
  
          socket.setTimeout(10000, () => {
            console.error("Socket timeout");
            socket.destroy();
          });
  
          socket.connect(port, ip, () => {
            socket.write(handshake);
          });
  
          let stage = "handshake";
          let buffer = Buffer.alloc(0);
  
          const pendingRequests = new Map<number, (Buffer[])>();
  
          socket.on("data", (data: Buffer) => {
            buffer = Buffer.concat([buffer, data]);
  
            if (stage === "handshake" && buffer.length >= 68) {
              const receivedInfoHash = buffer.subarray(28, 48);
              if (!receivedInfoHash.equals(infoHash)) {
                console.error("InfoHash mismatch");
                socket.destroy();
                return;
              }
              stage = "bitfield";
              buffer = buffer.subarray(68);
            }
  
            while (buffer.length >= 4) {
              const length = buffer.readUInt32BE(0);
              if (buffer.length < 4 + length) break;
  
              const id = buffer[4];
              const payload = buffer.subarray(5, 4 + length);
  
              if (id === 5 && stage === "bitfield") {
                socket.write(Buffer.from([0, 0, 0, 1, 2]));
                stage = "interested";
              } else if (id === 1 && stage === "interested") {
                stage = "unchoked";
  
                for (let pieceIndex = 0; pieceIndex < numPieces; pieceIndex++) {
                  const pieceOffset = pieceIndex * pieceLength;
                  const lastPieceLength = Math.min(pieceLength, totalLength - pieceOffset);
                  const numBlocks = Math.ceil(lastPieceLength / BLOCK_LEN);
                  const blocks: any = new Array(numBlocks).fill(undefined);
                  pendingRequests.set(pieceIndex, blocks);
  
                  for (let i = 0; i < numBlocks; i++) {
                    const begin = i * BLOCK_LEN;
                    const reqLen = i === numBlocks - 1 ? lastPieceLength - begin : BLOCK_LEN;
                    const request = Buffer.alloc(17);
                    request.writeUInt32BE(13, 0);
                    request.writeUInt8(6, 4);
                    request.writeUInt32BE(pieceIndex, 5);
                    request.writeUInt32BE(begin, 9);
                    request.writeUInt32BE(reqLen, 13);
                    socket.write(request);
                  }
                }
              } else if (id === 7 && stage === "unchoked") {
                const pieceIdx = payload.readUInt32BE(0);
                const begin = payload.readUInt32BE(4);
                const block = payload.subarray(8);
                const blockIndex = Math.floor(begin / BLOCK_LEN);
  
                const blocks = pendingRequests.get(pieceIdx);
                if (!blocks) return;
  
                if (blockIndex >= 0 && blockIndex < blocks.length) {
                  blocks[blockIndex] = block;
                }
  
                if (blocks.every(b => b instanceof Buffer)) {
                  const piece = Buffer.concat(blocks as Buffer[]);
                  const hash = createHash("sha1").update(piece).digest("hex");
                  const expected = pieceHashes.subarray(pieceIdx * 20, (pieceIdx + 1) * 20).toString("hex");
  
                  if (hash !== expected) {
                    console.error(`Hash mismatch on piece ${pieceIdx}`);
                  } else {
                    fileData[pieceIdx] = piece;
                    downloaded++;
                    console.log(`Piece ${pieceIdx} downloaded`);
                    if (downloaded === numPieces) {
                      const file = Buffer.concat(fileData);
                      writeFileSync(outputPath, file);
                      console.log("File download complete:", outputPath);
                      socket.destroy();
                    }
                  }
                }
              }
  
              buffer = buffer.subarray(4 + length);
            }
          });
  
          socket.on("error", (e) => {
            console.error("Socket error:", e);
          });
        });
      });
  
      req.on("error", (e) => {
        console.error("Tracker request error:", e);
      });
  
      req.end();
    } catch (e) {
      console.error("Download error:", e);
    }
  }
