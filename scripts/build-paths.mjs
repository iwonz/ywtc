export function redactCheckoutPaths(source, root) {
  return source.replaceAll(root, (match, offset) => {
    const next = source[offset + root.length];
    return next && !['/', '\\', '"', "'", '`'].includes(next) ? match : '.';
  });
}
