// 테스트는 node에서 돌아 Web Storage가 없습니다. 브라우저와 같은 모양의 메모리 저장소를 씁니다.
export function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, String(value));
    },
    removeItem: (key) => {
      items.delete(key);
    },
    clear: () => {
      items.clear();
    },
  };
}
