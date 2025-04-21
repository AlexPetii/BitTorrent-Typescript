// Examples:
// - decodeBencode("5:hello") -> "hello"
// - decodeBencode("10:hello12345") -> "hello12345"
function decodeBencode(
  bencodedValue: string
): string | number | (string | number)[] {
  switch (bencodedValue[0]) {
    case "i":
      return parseInt(bencodedValue.substring(1, bencodedValue.length - 1));
    case "l":
      const list: (string | number)[] = [];
      let index = 1;
      while (bencodedValue[index] !== "e") {
        if (bencodedValue[index] === "i") {
          const end = bencodedValue.indexOf("e", index);
          list.push(parseInt(bencodedValue.substring(index + 1, end)));
          index = end + 1;
        } else {
          const colon = bencodedValue.indexOf(":", index);
          const length = parseInt(bencodedValue.substring(index, colon));
          index = colon + 1;
          list.push(bencodedValue.substring(index, index + length));
          index += length;
        }
      }
      return list;
    default:
      if (!isNaN(parseInt(bencodedValue[0]))) {
        const firstColonIndex = bencodedValue.indexOf(":");
        if (firstColonIndex === -1) {
          throw new Error("Invalid encoded value");
        }
        return bencodedValue.substring(firstColonIndex + 1);
      } else {
        throw new Error("Only strings are supported at the moment");
      }
  }
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
