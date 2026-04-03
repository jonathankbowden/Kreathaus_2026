/* =============================================
   INTERACTION ENGINE
   Scroll blur, TeamLab ripples, carousels, page transitions
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {

    // ===== Page Entrance =====
    const mask = document.getElementById('pageMask');
    if (mask) {
        requestAnimationFrame(() => {
            mask.classList.add('loaded');
        });
    }

    // ===== Navigation scroll effect =====
    const nav = document.getElementById('navAlt');
    if (nav) {
        let lastScroll = 0;
        window.addEventListener('scroll', () => {
            const scroll = window.scrollY;
            nav.classList.toggle('scrolled', scroll > 50);
            lastScroll = scroll;
        }, { passive: true });
    }

    // ===== Scroll-based Orb Blur =====
    const orbCanvas = document.getElementById('orbCanvas');
    const heroSection = document.getElementById('heroSection');
    const scrollIndicator = document.getElementById('scrollIndicator');

    if (orbCanvas && heroSection) {
        window.addEventListener('scroll', () => {
            const scrollY = window.scrollY;
            const heroH = heroSection.offsetHeight;
            const progress = Math.min(scrollY / (heroH * 0.6), 1);

            // Blur the orb as user scrolls
            const blurAmount = progress * 20;
            const scale = 1 - progress * 0.1;
            const opacity = 1 - progress * 0.5;
            orbCanvas.style.filter = `blur(${blurAmount}px)`;
            orbCanvas.style.transform = `scale(${scale})`;
            orbCanvas.style.opacity = opacity;

            // Fade scroll indicator
            if (scrollIndicator) {
                scrollIndicator.style.opacity = Math.max(0, 1 - progress * 3);
            }

            // Blur hero text elements
            const blurTargets = heroSection.querySelectorAll('.scroll-blur-target');
            blurTargets.forEach(el => {
                const textBlur = progress * 12;
                const textOpacity = 1 - progress * 0.8;
                el.style.filter = `blur(${textBlur}px)`;
                el.style.opacity = textOpacity;
            });
        }, { passive: true });
    }

    // ===== Project Card Reveal on Scroll =====
    const projectCards = document.querySelectorAll('.project-card');
    if (projectCards.length > 0) {
        const revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, {
            threshold: 0.15,
            rootMargin: '0px 0px -50px 0px'
        });

        projectCards.forEach(card => revealObserver.observe(card));
    }

    // ===== Carousels (same logic, styled differently) =====
    document.querySelectorAll('[data-carousel]').forEach(carousel => {
        const track = carousel.querySelector('.carousel-track');
        const slides = carousel.querySelectorAll('.carousel-slide');
        const dotsContainer = carousel.querySelector('.carousel-dots');
        let currentIndex = 0;

        // Create dots
        slides.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.classList.add('carousel-dot');
            if (i === 0) dot.classList.add('active');
            dot.setAttribute('aria-label', `Slide ${i + 1}`);
            dot.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                goToSlide(i);
            });
            dotsContainer.appendChild(dot);
        });

        const dots = dotsContainer.querySelectorAll('.carousel-dot');

        function goToSlide(index) {
            currentIndex = index;
            track.scrollTo({ left: index * track.offsetWidth, behavior: 'smooth' });
            updateDots();
            // Pause all videos, play only the active one
            slides.forEach((slide, i) => {
                const vid = slide.querySelector('video');
                if (!vid) return;
                if (i === index) {
                    vid.currentTime = 0;
                    vid.play().catch(() => {});
                } else {
                    vid.pause();
                }
            });
        }

        function updateDots() {
            dots.forEach((dot, i) => {
                dot.classList.toggle('active', i === currentIndex);
            });
        }

        // Sync dots on scroll
        let scrollTimeout;
        track.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                const scrollLeft = track.scrollLeft;
                const slideWidth = track.offsetWidth;
                const newIndex = Math.round(scrollLeft / slideWidth);
                if (newIndex !== currentIndex && newIndex >= 0 && newIndex < slides.length) {
                    currentIndex = newIndex;
                    updateDots();
                    // Pause/play videos on manual scroll
                    slides.forEach((slide, i) => {
                        const vid = slide.querySelector('video');
                        if (!vid) return;
                        if (i === currentIndex) {
                            vid.currentTime = 0;
                            vid.play().catch(() => {});
                        } else {
                            vid.pause();
                        }
                    });
                }
            }, 50);
        });

        // Auto-advance only when visible
        let autoPlay = null;
        let isHovered = false;

        function getSlideDelay(index) {
            const video = slides[index].querySelector('video');
            if (video && video.duration && isFinite(video.duration)) {
                return video.duration * 1000 + 1000;
            }
            return 4000;
        }

        function scheduleNext() {
            if (isHovered) return;
            const delay = getSlideDelay(currentIndex);
            autoPlay = setTimeout(() => {
                currentIndex = (currentIndex + 1) % slides.length;
                goToSlide(currentIndex);
                scheduleNext();
            }, delay);
        }

        function startAutoPlay() {
            if (autoPlay || isHovered) return;
            scheduleNext();
        }

        function stopAutoPlay() {
            clearTimeout(autoPlay);
            autoPlay = null;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) startAutoPlay();
                else stopAutoPlay();
            });
        }, { threshold: 0.3 });

        observer.observe(carousel);

        carousel.addEventListener('mouseenter', () => { isHovered = true; stopAutoPlay(); });
        carousel.addEventListener('mouseleave', () => { isHovered = false; startAutoPlay(); });
        carousel.addEventListener('touchstart', () => { isHovered = true; stopAutoPlay(); }, { passive: true });
    });

    // ===== TeamLab-Inspired Ripple Layer =====
    const rippleCanvas = document.getElementById('rippleCanvas');
    if (rippleCanvas) {
        const rCtx = rippleCanvas.getContext('2d');
        let ripples = [];
        let animating = true;

        function resizeRipple() {
            rippleCanvas.width = window.innerWidth;
            rippleCanvas.height = window.innerHeight;
        }
        resizeRipple();
        window.addEventListener('resize', resizeRipple);

        // Create ripple on mouse move (throttled)
        let lastRippleTime = 0;
        document.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - lastRippleTime < 80) return;
            lastRippleTime = now;

            ripples.push({
                x: e.clientX,
                y: e.clientY,
                radius: 0,
                maxRadius: 80 + Math.random() * 60,
                opacity: 0.15,
                speed: 1 + Math.random() * 0.5,
            });

            // Limit ripple count
            if (ripples.length > 15) ripples.shift();
        });

        // Touch ripples
        document.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            const now = Date.now();
            if (now - lastRippleTime < 100) return;
            lastRippleTime = now;

            ripples.push({
                x: touch.clientX,
                y: touch.clientY,
                radius: 0,
                maxRadius: 100 + Math.random() * 80,
                opacity: 0.2,
                speed: 0.8 + Math.random() * 0.4,
            });

            if (ripples.length > 12) ripples.shift();
        }, { passive: true });

        function animateRipples() {
            if (!animating) return;

            rCtx.clearRect(0, 0, rippleCanvas.width, rippleCanvas.height);

            ripples = ripples.filter(r => {
                r.radius += r.speed;
                r.opacity *= 0.97;

                if (r.opacity < 0.005) return false;

                rCtx.beginPath();
                rCtx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
                rCtx.strokeStyle = `rgba(255, 255, 255, ${r.opacity})`;
                rCtx.lineWidth = 1;
                rCtx.stroke();

                return true;
            });

            requestAnimationFrame(animateRipples);
        }

        animateRipples();

        // Pause when tab hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                animating = false;
            } else {
                animating = true;
                animateRipples();
            }
        });
    }

    // ===== Ambient Sound Toggle (placeholder — no actual audio to avoid autoplay issues) =====
    // The button is visual-only for now. Could connect to Web Audio API ambient generation.

});
