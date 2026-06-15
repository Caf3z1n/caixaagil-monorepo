export function capitalizeFirstTextLetter(value: string) {
  const firstTextIndex = value.search(/\S/u);

  if (firstTextIndex === -1) {
    return value;
  }

  const firstLetter = value.charAt(firstTextIndex).toLocaleUpperCase("pt-BR");

  return `${value.slice(0, firstTextIndex)}${firstLetter}${value.slice(firstTextIndex + 1)}`;
}

export function uppercaseTextInput(value: string) {
  return value.toLocaleUpperCase("pt-BR");
}
