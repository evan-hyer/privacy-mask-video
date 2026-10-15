const COLORS = [
  {name: 'green', value: '#48ed95'}, {name: 'blue', value: '#63b3ff'},
  {name: 'pink', value: '#ff85c8'}, {name: 'gold', value: '#ffd54f'},
  {name: 'purple', value: '#c5a3ff'}, {name: 'orange', value: '#ffac68'},
  {name: 'cyan', value: '#62e4ed'}, {name: 'coral', value: '#ff8e8e'},
] as const;
export function faceColor(index: number): {readonly name: string; readonly value: string} { return COLORS[index % COLORS.length]!; }
