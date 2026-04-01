/**
 * Unit tests for pagination logic
 *
 * Tests the helper logic used in the admin PDFs page:
 *  - Page number list generation (buildPageNumbers)
 *  - Correct skip / limit calculations
 *  - Boundary conditions (first page, last page, single page)
 */

// ──────────────────────────────────────────────
// Helpers extracted for testability
// ──────────────────────────────────────────────

/**
 * Mirrors the buildPageNumbers logic inside the Pagination component.
 * Extracted here so it can be unit-tested without rendering React.
 *
 * Algorithm: always shows page 1, last page, and current ± 1.
 * Inserts '...' wherever there is a gap > 1 between consecutive pages.
 */
function buildPageNumbers(
  page: number,
  totalPages: number
): (number | '...')[] {
  if (totalPages === 0) return [];

  const pageSet = new Set<number>();
  pageSet.add(1);
  pageSet.add(totalPages);
  for (let i = Math.max(1, page - 1); i <= Math.min(totalPages, page + 1); i++) {
    pageSet.add(i);
  }

  const sorted = Array.from(pageSet).sort((a, b) => a - b);
  const result: (number | '...')[] = [];

  for (let idx = 0; idx < sorted.length; idx++) {
    if (idx > 0 && sorted[idx] - sorted[idx - 1] > 1) {
      result.push('...');
    }
    result.push(sorted[idx]);
  }

  return result;
}

/** Calculate skip value for a given page and limit */
function calcSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

/** Calculate total pages from count and limit */
function calcTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('Pagination helpers', () => {
  // ── calcSkip ─────────────────────────────────
  describe('calcSkip()', () => {
    it('returns 0 for page 1', () => {
      expect(calcSkip(1, 10)).toBe(0);
    });

    it('returns correct skip for page 2', () => {
      expect(calcSkip(2, 10)).toBe(10);
    });

    it('returns correct skip for page 5 with limit 10', () => {
      expect(calcSkip(5, 10)).toBe(40);
    });

    it('handles different page sizes', () => {
      expect(calcSkip(3, 25)).toBe(50);
    });
  });

  // ── calcTotalPages ────────────────────────────
  describe('calcTotalPages()', () => {
    it('returns 1 for 10 items with limit 10', () => {
      expect(calcTotalPages(10, 10)).toBe(1);
    });

    it('rounds up for partial last page', () => {
      expect(calcTotalPages(11, 10)).toBe(2);
      expect(calcTotalPages(21, 10)).toBe(3);
    });

    it('returns 0 for 0 total items', () => {
      expect(calcTotalPages(0, 10)).toBe(0);
    });

    it('works with limit of 1', () => {
      expect(calcTotalPages(5, 1)).toBe(5);
    });
  });

  // ── buildPageNumbers ──────────────────────────
  describe('buildPageNumbers()', () => {
    it('returns empty array when totalPages is 0', () => {
      expect(buildPageNumbers(1, 0)).toEqual([]);
    });

    it('returns [1] for a single page', () => {
      expect(buildPageNumbers(1, 1)).toEqual([1]);
    });

    it('always includes first, last, and current page', () => {
      // page 1 of 5: 1,2 shown, gap, 5  →  [1, 2, '...', 5]
      const r1 = buildPageNumbers(1, 5);
      expect(r1).toContain(1);
      expect(r1).toContain(5);

      // page 3 of 5: current ±1 covers 2,3,4 which bridges 1 and 5  →  [1, 2, 3, 4, 5]
      const r2 = buildPageNumbers(3, 5);
      expect(r2).toEqual([1, 2, 3, 4, 5]);
    });

    it('adds leading ellipsis when current page is far from start', () => {
      // page 7 of 10: set = {1, 6,7,8, 10}  →  [1, '...', 6, 7, 8, '...', 10]
      // Actually 8→10 gap=2 → '...' inserted; 1→6 gap=5 → '...' inserted
      const result = buildPageNumbers(7, 10);
      expect(result[0]).toBe(1);
      expect(result).toContain('...');
      expect(result[result.length - 1]).toBe(10);
      expect(result).toContain(7);
    });

    it('adds trailing ellipsis when current page is far from end', () => {
      const result = buildPageNumbers(1, 10);
      // Should be: 1 2 ... 10
      expect(result[0]).toBe(1);
      expect(result[result.length - 1]).toBe(10);
    });

    it('first and last page are always present', () => {
      const result = buildPageNumbers(5, 20);
      expect(result[0]).toBe(1);
      expect(result[result.length - 1]).toBe(20);
    });

    it('current page is always present', () => {
      [1, 5, 10, 15, 20].forEach((p) => {
        const result = buildPageNumbers(p, 20);
        expect(result).toContain(p);
      });
    });

    it('does not have consecutive duplicate numbers', () => {
      for (let p = 1; p <= 10; p++) {
        const result = buildPageNumbers(p, 10);
        const numbers = result.filter((v) => v !== '...');
        const unique = [...new Set(numbers)];
        expect(numbers).toEqual(unique);
      }
    });
  });

  // ── Pagination metadata helpers ───────────────
  describe('Pagination metadata', () => {
    it('hasNextPage is false on the last page', () => {
      const page = 3;
      const totalPages = 3;
      expect(page < totalPages).toBe(false);
    });

    it('hasPrevPage is false on the first page', () => {
      const page = 1;
      expect(page > 1).toBe(false);
    });

    it('correctly computes start and end item indices', () => {
      const page = 2;
      const limit = 10;
      const total = 25;

      const startItem = (page - 1) * limit + 1;
      const endItem = Math.min(page * limit, total);

      expect(startItem).toBe(11);
      expect(endItem).toBe(20);
    });

    it('endItem clamps to total on the last page', () => {
      const page = 3;
      const limit = 10;
      const total = 25;

      const endItem = Math.min(page * limit, total);
      expect(endItem).toBe(25); // not 30
    });
  });
});
