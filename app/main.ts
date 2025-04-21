// Examples:
// - decodeBencode("5:hello") -> "hello"
// - decodeBencode("10:hello12345") -> "hello12345"
function decodeBencode(bencodedValue: string): string | number {
  //number
  if (bencodedValue[0] === "i") {
    return parseInt(bencodedValue.substring(1, bencodedValue.length - 1));
  }
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
//test message
