import {readFileSync} from "fs";
import { createHash } from "crypto";
function decodeBencode(bencodedValue: string): any {
  function parse(index: number): [any, number] | any {
    const char = bencodedValue[index];

    switch (char) {
      case 'i': {
        const end = bencodedValue.indexOf('e', index);
        const number = parseInt(bencodedValue.substring(index + 1, end));
        return [number, end + 1];
      }

      case 'l': {
        const list: any[] = [];
        index++; 
        while (bencodedValue[index] !== 'e') {
          const [value, nextIndex] = parse(index);
          list.push(value);
          index = nextIndex;
        }
        return [list, index + 1];
      }
      case "d": {
      const dict: Record<string, any> = {};
      index++;
      while(bencodedValue[index] !== "e"){
        const [key, keyIndex] = parse(index);
        if(typeof key !== "string") {
          throw new Error (`Invalid key of index ${index}, must be string`)
        }
        const [value, nextIndex] = parse(keyIndex);
        dict[key] = value;
        index = nextIndex;
      }
      return [dict, index + 1];
      }
      default: {
        if (/\d/.test(char)) {
          const colon = bencodedValue.indexOf(':', index);
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
const input = args[3]

if (command === "decode") {
  try {
    const decode = decodeBencode(input);
    console.log(JSON.stringify(decode));
  } catch {
    console.error("error decode");
  }
}else if (command === "info"){
  try {
    const fileBuffer = readFileSync(input);
    const fileString = fileBuffer.toString("binary");
    const torrent = decodeBencode(fileString)
    const anounce = torrent["announce"]
    const length = torrent["info"]?.["length"];

    console.log(`Tracker URL: ${anounce}`);
    console.log(`Length: ${length}`);
    console.log(`Info Hash: ${createHash("sha1").update(fileBuffer).digest("hex")}`)
  }catch{
    console.error("error info")
  }const fileBuffer = readFileSync(input);
    const fileString = fileBuffer.toString("binary");
}
