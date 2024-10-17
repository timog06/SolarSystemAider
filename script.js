let scene, camera, renderer, sun, planets, pointLight, ambientLight, starField;
let rotationSpeed = 1;
const MAX_ROTATION_SPEED = 50;
let planetSizeScale = 1;
let cameraDistanceScale = 1;
const textureLoader = new THREE.TextureLoader();
const clock = new THREE.Clock();

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

    await createSolarSystem();

    window.addEventListener('resize', onWindowResize, false);

    animate();
}

async function createSolarSystem() {
    createStarField();
    
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
        createPlanet(1.6, 'textures/earth.jpg', 20, true, false, true),  // Earth with moon and clouds
        createPlanet(1.2, 'textures/mars.jpg', 25),  // Mars
        createPlanet(3.5, 'textures/jupiter.jpg', 35),  // Jupiter
        createPlanet(3, 'textures/saturn.jpg', 45, false, true),  // Saturn with rings
        createPlanet(2.5, 'textures/uranus.jpg', 55),  // Uranus
        createPlanet(2.3, 'textures/neptune.jpg', 65)  // Neptune
    ]);

    createOrbitLines();
}

async function createPlanet(size, textureFile, orbitRadius, hasMoon = false, hasRings = false, hasClouds = false) {
    console.log(`Creating planet with texture: ${textureFile}`);
    const planetGroup = new THREE.Group();
    
    const planetGeometry = new THREE.SphereGeometry(size, 32, 32);
    const textureOrColor = await loadTextureWithFallback(textureFile, 0x888888);
    
    const planetMaterial = new THREE.MeshPhongMaterial({ 
        map: textureOrColor instanceof THREE.Texture ? textureOrColor : null,
        color: textureOrColor instanceof THREE.Color ? textureOrColor : 0xFFFFFF,
        shininess: 30,
        specular: 0x444444
    });
    const planet = new THREE.Mesh(planetGeometry, planetMaterial);
    planetGroup.add(planet);

    if (hasMoon) {
        const moonSize = size * 0.2;
        const moonOrbitRadius = size * 2;
        const moon = await createMoon(moonSize, moonOrbitRadius);
        planetGroup.add(moon);
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
        rotationSpeed: 0.02 / size // Smaller planets rotate faster
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
    moon.position.x = orbitRadius;
    
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

    // Rotate planets and update positions
    planets.forEach(planet => {
        planet.angle += 0.005 * rotationSpeed / planet.orbitRadius * delta;
        planet.group.position.x = Math.cos(planet.angle) * planet.orbitRadius;
        planet.group.position.z = Math.sin(planet.angle) * planet.orbitRadius;
        
        // Rotate the planet on its axis
        planet.mesh.rotation.y += planet.rotationSpeed * rotationSpeed * delta;

        // Rotate moons and clouds (if any)
        planet.group.children.forEach(child => {
            if (child instanceof THREE.Group) { // This is a moon group
                child.rotation.y += 0.02 * rotationSpeed * delta;
            } else if (child.material && child.material.map && child.material.map.name === 'earth_clouds.jpg') {
                child.rotation.y += 0.005 * rotationSpeed * delta; // Rotate clouds slower than the planet
            }
        });
    });

    // Rotate the star field slowly
    if (starField) {
        starField.rotation.y += 0.0001 * rotationSpeed * delta;
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
    const cameraDistanceSlider = document.getElementById('camera-distance-slider');
    const alignPlanetsButton = document.getElementById('align-planets');

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

    cameraDistanceSlider.addEventListener('input', (e) => {
        cameraDistanceScale = parseFloat(e.target.value) / 100;
        updateCameraPosition();
    });

    alignPlanetsButton.addEventListener('click', alignPlanets);
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
    const basePosition = new THREE.Vector3(70, 50, 70);
    camera.position.copy(basePosition.multiplyScalar(cameraDistanceScale));
    camera.lookAt(scene.position);
}

function updateRotationSpeed() {
    planets.forEach(planet => {
        planet.rotationSpeed = (0.02 / planet.mesh.geometry.parameters.radius) * (rotationSpeed / MAX_ROTATION_SPEED);
    });
}

init().then(() => {
    initSettings();
});
