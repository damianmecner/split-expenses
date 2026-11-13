// Settlement logic: calculates who owes whom.
// It works on plain data (no database, no server), so it is easy to test.
//
// Input "rows" = unsettled debts, one row per (debtor, creditor, category):
// { debtor_id, debtor_name, creditor_id, creditor_name, category, amount_cents }

// Net debt between each pair of people. If A owes B 30 and B owes A 10,
// the result is one debt: A owes B 20.
function netDebts(rows) {
  const pairs = new Map();
  const names = new Map();

  for (const row of rows) {
    if (row.debtor_id === row.creditor_id) continue;
    names.set(row.debtor_id, row.debtor_name);
    names.set(row.creditor_id, row.creditor_name);

    const low = Math.min(row.debtor_id, row.creditor_id);
    const high = Math.max(row.debtor_id, row.creditor_id);
    const key = low + '-' + high;
    const sign = row.debtor_id === low ? 1 : -1; // positive = "low" owes "high"
    const previous = pairs.has(key) ? pairs.get(key).cents : 0;
    pairs.set(key, { low, high, cents: previous + sign * row.amount_cents });
  }

  const debts = [];
  for (const { low, high, cents } of pairs.values()) {
    if (cents === 0) continue;
    const fromId = cents > 0 ? low : high;
    const toId = cents > 0 ? high : low;
    debts.push({
      from_id: fromId,
      from_name: names.get(fromId),
      to_id: toId,
      to_name: names.get(toId),
      amount_cents: Math.abs(cents),
    });
  }

  debts.sort((a, b) => b.amount_cents - a.amount_cents || a.from_name.localeCompare(b.from_name));
  return debts;
}

// Balance of every member: positive = others owe them, negative = they owe others.
function computeBalances(members, rows) {
  const balances = new Map(
    members.map((m) => [m.id, { user_id: m.id, name: m.name, balance_cents: 0 }])
  );
  for (const row of rows) {
    if (balances.has(row.creditor_id)) balances.get(row.creditor_id).balance_cents += row.amount_cents;
    if (balances.has(row.debtor_id)) balances.get(row.debtor_id).balance_cents -= row.amount_cents;
  }
  return [...balances.values()];
}

// Open debts grouped by category (not netted), biggest category first.
function groupByCategory(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.category)) {
      groups.set(row.category, { category: row.category, total_cents: 0, items: [] });
    }
    const group = groups.get(row.category);
    group.total_cents += row.amount_cents;
    group.items.push({
      from_id: row.debtor_id,
      from_name: row.debtor_name,
      to_id: row.creditor_id,
      to_name: row.creditor_name,
      amount_cents: row.amount_cents,
    });
  }

  const result = [...groups.values()];
  result.sort((a, b) => b.total_cents - a.total_cents || a.category.localeCompare(b.category));
  for (const group of result) {
    group.items.sort((a, b) => b.amount_cents - a.amount_cents);
  }
  return result;
}

function buildSummary(members, rows, currentUserId) {
  const debts = netDebts(rows);
  let youOwe = 0;
  let owedToYou = 0;
  for (const debt of debts) {
    if (debt.from_id === currentUserId) youOwe += debt.amount_cents;
    if (debt.to_id === currentUserId) owedToYou += debt.amount_cents;
  }
  return {
    balances: computeBalances(members, rows),
    debts,
    breakdown: groupByCategory(rows),
    totals: { you_owe_cents: youOwe, owed_to_you_cents: owedToYou },
  };
}

module.exports = { netDebts, computeBalances, groupByCategory, buildSummary };