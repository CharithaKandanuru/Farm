export function daysFromNow(dateStr: string): number {
  const today = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function generateOrderNumber(): string {
  const num = 1000 + Math.floor(Math.random() * 9000);
  return `#FC-${num}`;
}

export function showToast(message: string) {
  const toastEl = document.getElementById('toast');
  if (toastEl) {
    toastEl.textContent = message;
    toastEl.classList.add('on');
    setTimeout(() => toastEl.classList.remove('on'), 3200);
  }
}

export const PRODUCT_IMAGES: Record<string, string> = {
  'Tomatoes': 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&h=300&fit=crop',
  'Spinach': 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400&h=300&fit=crop',
  'Carrots': 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400&h=300&fit=crop',
  'Red Chilli': 'https://images.unsplash.com/photo-1583119022894-919a68a3d0e3?w=400&h=300&fit=crop',
  'Mangoes': 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&h=300&fit=crop',
  'Capsicum': 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400&h=300&fit=crop',
  'Brinjal': 'https://images.unsplash.com/photo-1628773822503-930a7eaecf80?w=400&h=300&fit=crop',
  'Onions': 'https://images.unsplash.com/photo-1508747703725-719777637510?w=400&h=300&fit=crop',
  'Bananas': 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&h=300&fit=crop',
  'Cucumber': 'https://images.unsplash.com/photo-1566486189376-d5f21e25aae4?w=400&h=300&fit=crop',
  'Coriander': 'https://images.unsplash.com/photo-1611312449408-fcece27cdbb7?w=400&h=300&fit=crop',
  'Lady Finger': 'https://images.unsplash.com/photo-1600841850168-dd5f4697bebd?w=400&h=300&fit=crop',
  'default': 'https://images.unsplash.com/photo-1540420828642-fca2c5c18abe?w=400&h=300&fit=crop',
};

export function getProductImage(name: string): string {
  return PRODUCT_IMAGES[name] || PRODUCT_IMAGES['default'];
}
