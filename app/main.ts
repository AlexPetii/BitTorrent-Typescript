import { readFileSync } from "fs";
import { createHash } from "crypto";
import { request as httpsRequest } from "https";
import { URL } from "url";
import { request } from "http";

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

    req.on("error", (err) => {
      console.error("Request error:", err);
    });

    req.end();
  } catch (e) {
    console.error("Error:", e);
  }
}
