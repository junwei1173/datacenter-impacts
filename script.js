const revealItems = document.querySelectorAll('.reveal');

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
      }
    });
  },
  {
    threshold: 0.2,
    rootMargin: '0px 0px -8% 0px'
  }
);

revealItems.forEach((item) => observer.observe(item));
