// Mobile-money details a business can show on its shop page so buyers pay it directly.
// PATA only displays these details: money goes from the buyer's phone to the business,
// never through PATA.

// `number` describes the number field; `steps` are the phone-menu steps shown to buyers.
const METHODS = {
  till: {
    label: 'M-Pesa Buy Goods (Till)',
    provider: 'M-Pesa',
    numberLabel: 'Till number',
    kind: 'shortcode',
    steps: (p) => [
      'Open M-PESA on your phone and choose Lipa na M-PESA.',
      'Choose Buy Goods and Services.',
      `Enter Till number ${p.number}, then the amount.`,
      'Enter your PIN and confirm.',
    ],
  },
  paybill: {
    label: 'M-Pesa Paybill',
    provider: 'M-Pesa',
    numberLabel: 'Business number',
    kind: 'shortcode',
    steps: (p) => [
      'Open M-PESA on your phone and choose Lipa na M-PESA.',
      'Choose Pay Bill.',
      `Enter Business number ${p.number} and Account number ${p.account}.`,
      'Enter the amount and your PIN, then confirm.',
    ],
  },
  pochi: {
    label: 'M-Pesa Pochi la Biashara',
    provider: 'M-Pesa',
    numberLabel: 'Pochi number',
    kind: 'phone',
    steps: (p) => [
      'Open M-PESA on your phone and choose Lipa na M-PESA.',
      'Choose Pochi la Biashara.',
      `Enter phone number ${p.display}, then the amount.`,
      'Enter your PIN and confirm.',
    ],
  },
  airtel: {
    label: 'Airtel Money',
    provider: 'Airtel Money',
    numberLabel: 'Airtel Money number',
    kind: 'phone',
    steps: (p) => [
      'Open Airtel Money on your phone (or dial *334#).',
      'Choose Send Money.',
      `Enter phone number ${p.display}, then the amount.`,
      'Enter your PIN and confirm.',
    ],
  },
};

// Kenyan mobile numbers: 07XX / 01XX, or the same with +254 / 254 in front.
function normalizePhone(input) {
  const digits = input.replace(/[\s-]/g, '');
  const m = /^(?:\+?254|0)([17]\d{8})$/.exec(digits);
  return m ? `0${m[1]}` : null;
}

const formatPhone = (n) => `${n.slice(0, 4)} ${n.slice(4)}`;

// Reads the payment fields from the sell / edit form.
// Returns { values, errors, row: [method, number, account] }.
function fromForm(body) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const values = { payMethod: str(body.payMethod), payNumber: str(body.payNumber), payAccount: str(body.payAccount) };
  const errors = [];
  const method = METHODS[values.payMethod];

  if (!values.payMethod) return { values: { payMethod: '', payNumber: '', payAccount: '' }, errors, row: ['', '', ''] };
  if (!method) return { values, errors: ['Choose a valid payment method.'], row: ['', '', ''] };

  let number = '';
  if (method.kind === 'shortcode') {
    number = values.payNumber.replace(/\s/g, '');
    if (!/^\d{5,7}$/.test(number)) errors.push(`Enter a valid ${method.numberLabel.toLowerCase()} (5 to 7 digits).`);
  } else {
    number = normalizePhone(values.payNumber);
    if (!number) errors.push(`Enter a valid ${method.numberLabel}, e.g. 0712 345678.`);
  }

  let account = '';
  if (values.payMethod === 'paybill') {
    account = values.payAccount;
    if (!account) errors.push('Enter the Paybill account number buyers should use.');
    else if (!/^[A-Za-z0-9 #-]{1,20}$/.test(account)) errors.push('The Paybill account number can only use letters, numbers and spaces (up to 20).');
  }

  if (!errors.length) {
    values.payNumber = method.kind === 'phone' ? formatPhone(number) : number;
    values.payAccount = account;
  }
  return { values, errors, row: [values.payMethod, number || '', account] };
}

// What the shop page shows, or null when the listing has no payment details.
function forListing(l) {
  const method = METHODS[l.pay_method];
  if (!method || !l.pay_number) return null;
  const p = {
    number: l.pay_number,
    account: l.pay_account,
    display: method.kind === 'phone' ? formatPhone(l.pay_number) : l.pay_number,
  };
  return {
    method: l.pay_method,
    label: method.label,
    provider: method.provider,
    numberLabel: method.numberLabel,
    display: p.display,
    copyValue: l.pay_number,
    account: l.pay_method === 'paybill' ? l.pay_account : '',
    steps: method.steps(p),
  };
}

const OPTIONS = Object.entries(METHODS).map(([value, m]) => ({ value, label: m.label, numberLabel: m.numberLabel, kind: m.kind }));

module.exports = { METHODS, OPTIONS, fromForm, forListing, normalizePhone };
