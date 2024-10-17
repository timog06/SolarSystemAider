let scene, camera, renderer, sun, planets, pointLight, ambientLight, starField, asteroidBelt;
let rotationSpeed = 1;
const MAX_ROTATION_SPEED = 100;
let planetSizeScale = 1;
let asteroidCount = 1000;
const textureLoader = new THREE.TextureLoader();
const clock = new THREE.Clock();

let earthDayTexture, earthNightTexture;

// Helper function to load texture with fallback
function loadTextureWithFallback(url, fallbackColor) {
    return new Promise((resolve) => {
        textureLoader.load(
            url,
            (texture) => {
                console.log(`Texture loaded successfully: ${url}`);
                resolve(texture);
            },
            undefined,
            (error) => {
                console.error(`Error loading texture ${url}:`, error);
                resolve(new THREE.Color(fallbackColor));
            }
        );
    });
}

async function init() {
    console.log('Initializing solar system...');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(70, 50, 70);
    camera.lookAt(scene.position);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('scene-container').appendChild(renderer.domElement);

    // Load Earth day and night textures
    earthDayTexture = await loadTextureWithFallback('textures/earth_day.jpg', 0x1E90FF);
    earthNightTexture = await loadTextureWithFallback('textures/earth_night.jpg', 0x000033);

    await createSolarSystem();

    window.addEventListener('resize', onWindowResize, false);

    animate();
}

async function createSolarSystem() {
    createStarField();
    createAsteroidBelt();
    
    // Create Sun
    const sunGeometry = new THREE.SphereGeometry(5, 32, 32);
    const sunTextureOrColor = await loadTextureWithFallback('textures/sun.jpg', 0xFFFF00);
    const sunMaterial = new THREE.MeshBasicMaterial({ 
        map: sunTextureOrColor instanceof THREE.Texture ? sunTextureOrColor : null,
        color: sunTextureOrColor instanceof THREE.Color ? sunTextureOrColor : 0xFFFFFF
    });
    sun = new THREE.Mesh(sunGeometry, sunMaterial);
    scene.add(sun);

    // Add point light (sun light)
    pointLight = new THREE.PointLight(0xffffff, 1.5, 1000);
    scene.add(pointLight);

    // Add ambient light
    ambientLight = new THREE.AmbientLight(0x404040, 0.5); // soft white light
    scene.add(ambientLight);

    // Create planets
    planets = await Promise.all([
        createPlanet(0.8, 'textures/mercury.jpg', 10),  // Mercury
        createPlanet(1.5, 'textures/venus.jpg', 15),  // Venus
        createPlanet(1.6, 'textures/earth.jpg', 20, true, false, true, true),  // Earth with moon, clouds, and day/night cycle
        createPlanet(1.2, 'textures/mars.jpg', 25, false, false, false, false, [{ size: 0.1, orbitRadius: 2 }, { size: 0.08, orbitRadius: 2.5 }]),  // Mars with Phobos and Deimos
        createPlanet(3.5, 'textures/jupiter.jpg', 45, false, false, false, false, [
            { size: 0.28, orbitRadius: 5 },  // Io
            { size: 0.24, orbitRadius: 6 },  // Europa
            { size: 0.41, orbitRadius: 7 },  // Ganymede
            { size: 0.38, orbitRadius: 8 }   // Callisto
        ]),  // Jupiter with Galilean moons
        createPlanet(3, 'textures/saturn.jpg', 60, false, true, false, false, [{ size: 0.4, orbitRadius: 6 }]),  // Saturn with rings and Titan
        createPlanet(2.5, 'textures/uranus.jpg', 75, false, false, false, false, [{ size: 0.2, orbitRadius: 4 }]),  // Uranus with Titania
        createPlanet(2.3, 'textures/neptune.jpg', 90, false, false, false, false, [{ size: 0.21, orbitRadius: 5 }])  // Neptune with Triton
    ]);

    createOrbitLines();
}

async function createPlanet(size, textureFile, orbitRadius, hasMoon = false, hasRings = false, hasClouds = false, isEarth = false, moons = []) {
    console.log(`Creating planet with texture: ${textureFile}`);
    const planetGroup = new THREE.Group();
    
    const planetGeometry = new THREE.SphereGeometry(size, 32, 32);
    let planetMaterial;

    if (isEarth) {
        planetMaterial = new THREE.ShaderMaterial({
            uniforms: {
                dayTexture: { value: earthDayTexture },
                nightTexture: { value: earthNightTexture },
                sunDirection: { value: new THREE.Vector3(1, 0, 0) }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D dayTexture;
                uniform sampler2D nightTexture;
                uniform vec3 sunDirection;
                varying vec2 vUv;
                varying vec3 vNormal;
                void main() {
                    float intensity = max(0.0, dot(vNormal, sunDirection));
                    vec4 dayColor = texture2D(dayTexture, vUv);
                    vec4 nightColor = texture2D(nightTexture, vUv);
                    gl_FragColor = mix(nightColor, dayColor, intensity);
                }
            `
        });
    } else {
        const textureOrColor = await loadTextureWithFallback(textureFile, 0x888888);
        planetMaterial = new THREE.MeshPhongMaterial({ 
            map: textureOrColor instanceof THREE.Texture ? textureOrColor : null,
            color: textureOrColor instanceof THREE.Color ? textureOrColor : 0xFFFFFF,
            shininess: 30,
            specular: 0x444444
        });
    }

    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    planetGroup.add(planet);

    let moonObjects = [];
    if (hasMoon || moons.length > 0) {
        if (moons.length === 0) {
            moons = [{ size: size * 0.2, orbitRadius: size * 2 }];
        }
        for (const moon of moons) {
            const moonObj = await createMoon(moon.size, moon.orbitRadius);
            planetGroup.add(moonObj);
            moonObjects.push({
                group: moonObj,
                orbitRadius: moon.orbitRadius,
                angle: Math.random() * Math.PI * 2,
                rotationSpeed: 0.02 / moon.size
            });
        }
    }

    if (hasRings) {
        const rings = await createSaturnRings(size);
        planetGroup.add(rings);
    }

    if (hasClouds) {
        const clouds = await createClouds(size);
        planetGroup.add(clouds);
    }

    planetGroup.position.x = orbitRadius;
    scene.add(planetGroup);

    return { 
        group: planetGroup, 
        mesh: planet,
        orbitRadius: orbitRadius, 
        angle: Math.random() * Math.PI * 2,
        rotationSpeed: 0.02 / size, // Smaller planets rotate faster
        moons: moonObjects
    };
}

async function createMoon(size, orbitRadius) {
    const moonGeometry = new THREE.SphereGeometry(size, 32, 32);
    const textureOrColor = await loadTextureWithFallback('textures/moon.jpg', 0xAAAAAA);
    const moonMaterial = new THREE.MeshPhongMaterial({ 
        map: textureOrColor instanceof THREE.Texture ? textureOrColor : null,
        color: textureOrColor instanceof THREE.Color ? textureOrColor : 0xFFFFFF
    });
    const moon = new THREE.Mesh(moonGeometry, moonMaterial);
    
    const moonGroup = new THREE.Group();
    moonGroup.add(moon);
    return moonGroup;
}

async function createSaturnRings(planetSize) {
    const innerRadius = planetSize * 1.2;
    const outerRadius = planetSize * 2;
    const ringGeometry = new THREE.RingGeometry(innerRadius, outerRadius, 64);
    
    const ringTexture = await loadTextureWithFallback('textures/saturn_rings.png', 0xF4A460);
    const ringMaterial = new THREE.MeshBasicMaterial({ 
        map: ringTexture instanceof THREE.Texture ? ringTexture : null,
        color: ringTexture instanceof THREE.Color ? ringTexture : 0xFFFFFF,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
    });
    
    if (ringTexture instanceof THREE.Texture) {
        ringTexture.rotation = Math.PI / 2;
        ringTexture.center = new THREE.Vector2(0.5, 0.5);
    }
    
    const rings = new THREE.Mesh(ringGeometry, ringMaterial);
    rings.rotation.x = Math.PI / 2;
    return rings;
}

async function createClouds(planetSize) {
    const cloudGeometry = new THREE.SphereGeometry(planetSize * 1.01, 32, 32);
    const cloudTexture = await loadTextureWithFallback('textures/earth_clouds.jpg', 0xFFFFFF);
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: cloudTexture instanceof THREE.Texture ? cloudTexture : null,
        transparent: true,
        opacity: 0.8
    });
    return new THREE.Mesh(cloudGeometry, cloudMaterial);
}

function createStarField() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({ color: 0xFFFFFF, size: 0.1 });

    const starsVertices = [];
    for (let i = 0; i < 10000; i++) {
        const x = (Math.random() - 0.5) * 2000;
        const y = (Math.random() - 0.5) * 2000;
        const z = (Math.random() - 0.5) * 2000;
        starsVertices.push(x, y, z);
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    starField = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(starField);
}

function createAsteroidBelt() {
    const asteroidGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const asteroidMaterial = new THREE.MeshBasicMaterial({ color: 0x888888 });
    
    asteroidBelt = new THREE.Group();
    
    for (let i = 0; i < asteroidCount; i++) {
        const asteroid = new THREE.Mesh(asteroidGeometry, asteroidMaterial);
        const angle = Math.random() * Math.PI * 2;
        const radius = 32 + Math.random() * 8;  // Adjusted to be between Mars and Jupiter
        asteroid.position.set(
            Math.cos(angle) * radius,
            (Math.random() - 0.5) * 3,  // Slightly increased vertical spread
            Math.sin(angle) * radius
        );
        asteroid.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        asteroidBelt.add(asteroid);
    }
    
    scene.add(asteroidBelt);
}

function createOrbitLines() {
    planets.forEach(planet => {
        const orbitGeometry = new THREE.BufferGeometry();
        const orbitMaterial = new THREE.LineBasicMaterial({ color: 0xFFFFFF, opacity: 0.5, transparent: true });

        const orbitVertices = [];
        for (let i = 0; i <= 64; i++) {
            const angle = (i / 64) * Math.PI * 2;
            orbitVertices.push(
                Math.cos(angle) * planet.orbitRadius,
                0,
                Math.sin(angle) * planet.orbitRadius
            );
        }

        orbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(orbitVertices, 3));
        const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
        scene.add(orbitLine);
    });
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    // Update sun direction for Earth's day/night cycle
    const earthPlanet = planets[2]; // Assuming Earth is the third planet
    if (earthPlanet && earthPlanet.mesh.material.uniforms) {
        const sunDirection = new THREE.Vector3(1, 0, 0).applyQuaternion(earthPlanet.group.quaternion).normalize();
        earthPlanet.mesh.material.uniforms.sunDirection.value = sunDirection;
    }

    // Rotate planets and update positions
    planets.forEach(planet => {
        planet.angle += 0.005 * rotationSpeed * delta;
        planet.group.position.x = Math.cos(planet.angle) * planet.orbitRadius;
        planet.group.position.z = Math.sin(planet.angle) * planet.orbitRadius;
        
        // Rotate the planet on its axis
        planet.mesh.rotation.y += planet.rotationSpeed * rotationSpeed * delta;

        // Rotate moons individually
        planet.moons.forEach(moon => {
            moon.angle += moon.rotationSpeed * rotationSpeed * delta;
            const moonX = Math.cos(moon.angle) * moon.orbitRadius;
            const moonZ = Math.sin(moon.angle) * moon.orbitRadius;
            moon.group.position.set(moonX, 0, moonZ);
            moon.group.children[0].rotation.y += moon.rotationSpeed * rotationSpeed * delta;
        });

        // Rotate clouds (if any)
        planet.group.children.forEach(child => {
            if (child.material && child.material.map && child.material.map.name === 'earth_clouds.jpg') {
                child.rotation.y += 0.005 * rotationSpeed * delta; // Rotate clouds slower than the planet
            }
        });
    });

    // Rotate the star field slowly
    if (starField) {
        starField.rotation.y += 0.0001 * rotationSpeed * delta;
    }

    // Rotate the asteroid belt
    if (asteroidBelt) {
        asteroidBelt.rotation.y += 0.0005 * rotationSpeed * delta;
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function initSettings() {
    const toggleButton = document.getElementById('toggle-settings');
    const settingsPanel = document.getElementById('settings-panel');
    const speedSlider = document.getElementById('speed-slider');
    const planetSizeSlider = document.getElementById('planet-size-slider');
    const cameraXSlider = document.getElementById('camera-x-slider');
    const cameraYSlider = document.getElementById('camera-y-slider');
    const cameraZSlider = document.getElementById('camera-z-slider');
    const asteroidCountSlider = document.getElementById('asteroid-count-slider');
    const alignPlanetsButton = document.getElementById('align-planets');
    const resetCameraButton = document.getElementById('reset-camera');

    toggleButton.addEventListener('click', () => {
        settingsPanel.classList.toggle('hidden');
    });

    speedSlider.addEventListener('input', (e) => {
        rotationSpeed = parseFloat(e.target.value);
        updateRotationSpeed();
    });

    planetSizeSlider.addEventListener('input', (e) => {
        planetSizeScale = parseFloat(e.target.value);
        updatePlanetSizes();
    });


    cameraXSlider.addEventListener('input', updateCameraPosition);
    cameraYSlider.addEventListener('input', updateCameraPosition);
    cameraZSlider.addEventListener('input', updateCameraPosition);

    asteroidCountSlider.addEventListener('input', (e) => {
        asteroidCount = parseInt(e.target.value);
        updateAsteroidBelt();
    });

    alignPlanetsButton.addEventListener('click', alignPlanets);
    resetCameraButton.addEventListener('click', resetCamera);
}

function alignPlanets() {
    planets.forEach((planet, index) => {
        planet.angle = 0;
        planet.group.position.x = planet.orbitRadius;
        planet.group.position.z = 0;
    });
}

function updatePlanetSizes() {
    planets.forEach(planet => {
        planet.group.scale.setScalar(planetSizeScale);
    });
}

function updateCameraPosition() {
    const x = parseFloat(document.getElementById('camera-x-slider').value);
    const y = parseFloat(document.getElementById('camera-y-slider').value);
    const z = parseFloat(document.getElementById('camera-z-slider').value);
    camera.position.set(x, y, z);
    camera.lookAt(scene.position);
}

function resetCamera() {
    document.getElementById('camera-x-slider').value = 70;
    document.getElementById('camera-y-slider').value = 50;
    document.getElementById('camera-z-slider').value = 70;
    updateCameraPosition();
}

function updateAsteroidBelt() {
    scene.remove(asteroidBelt);
    createAsteroidBelt();
}

function updateRotationSpeed() {
    planets.forEach(planet => {
        planet.rotationSpeed = (0.02 / planet.mesh.geometry.parameters.radius) * (rotationSpeed / MAX_ROTATION_SPEED);
    });
}

init().then(() => {
    initSettings();
});
