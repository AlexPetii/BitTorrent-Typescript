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

    const infoKey = "4:info";
    const infoStart = fileString.indexOf(infoKey) + infoKey.length;
    const findInfoEnd = (index: number): number => {
      let depth = 0;
      while (index < fileString.length) {
        const char = fileString[index];
        if (char === "d" || char === "l") {
          depth++;
          index++;
        } else if (char === "e") {
          depth--;
          index++;
        }else if(char === "i"){
          index = fileString.indexOf('e', index) + 1;
        }else if (/\d/.test(char)) {
          const colon = fileString.indexOf(':', index);
          const len = parseInt(fileString.substring(index, colon));
          index = colon + 1 + len;
        } else {
          throw new Error("Unknown format in info dict");
        }
      }
      return index;
    };

    const infoEnd = findInfoEnd(infoStart);
    const infoByteStart = Buffer.byteLength(fileString.substring(0, infoStart), "binary");
    const infoByteEnd = Buffer.byteLength(fileString.substring(0, infoEnd), "binary");

    const infoBuffer = fileBuffer.subarray(infoByteStart, infoByteEnd);
    const infoHash = createHash("sha1").update(infoBuffer).digest("hex");

    console.log(`Tracker URL: ${anounce}`);
    console.log(`Length: ${length}`);
    console.log(`Info Hash: ${infoHash}`)
  } catch {
    console.error("error info");
  }
  const fileBuffer = readFileSync(input);
  const fileString = fileBuffer.toString("binary");
}
