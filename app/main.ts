import { readFileSync } from "fs";
import { createHash } from "crypto";
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
  } catch {
    console.error("error decode");
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
          const length = parseInt(fileString.substring(index, colon));
          index = colon + 1 + length;
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
    const announce = torrent["announce"];
    const length = torrent["info"]?.["length"];

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
          const length = parseInt(fileString.substring(index, colon));
          index = colon + 1 + length;
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
    function urlEncode(buffer: Buffer) {
      return Array.from(buffer)
        .map((byte) => `%${byte.toString(16).padStart(2, "0")}`)
        .join("");
    }
    

    const infoBuffer = fileBuffer.subarray(infoByteStart, infoByteEnd);
    const infoHashBuffer = createHash("sha1").update(infoBuffer).digest();
    const announceURL = new URL(announce);
    const params = new URLSearchParams();
    params.append("info_hash", infoHashBuffer.toString("binary"));
    params.append("peer_id", "-PC0001-123456789012");
    params.append("port", "6881");
    params.append("uploaded", "0");
    params.append("downloaded", "0");
    params.append("left", length.toString());
    params.append("compact", "1");
    announceURL.search = params.toString();

    const protocol =
      announceURL.protocol === "https:" ? require("https") : require("http");

      protocol.get(announceURL, (res:any) => {
        const data: Buffer[] = [];
        res.on("data", (chunk: Buffer) => data.push(chunk));
        res.on("end", () => {
          const response = Buffer.concat(data);
          const trackerResponse = decodeBencode(response.toString("binary"));
          const peers = trackerResponse["peers"];
      
          if (!peers) {
            console.error("No peers in tracker response");
            return;
          }
      
          const peersBuffer = Buffer.from(peers, "binary");
          for (let i = 0; i < peersBuffer.length; i += 6) {
            const ip = `${peersBuffer[i]}.${peersBuffer[i + 1]}.${peersBuffer[i + 2]}.${peersBuffer[i + 3]}`;
            const port = peersBuffer.readUInt16BE(i + 4);
            console.log(`${ip}:${port}`);
          }
        });
      }).on("error", (err: any) => {
        console.error("Request error:", err);
      })
    }catch(err){
      console.log(err)
    }
  }
