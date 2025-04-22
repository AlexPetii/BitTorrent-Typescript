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
const bencodedValue = args[3];

if (args[2] === "decode") {
  try {
    const decode = decodeBencode(bencodedValue);
    console.log(JSON.stringify(decode));
  } catch {
    console.error("error decode");
  }
}
