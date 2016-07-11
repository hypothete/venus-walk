(function(THREE, Promise, console){
	'use strict';

	var renderer = new THREE.WebGLRenderer();
	var texLoad = new THREE.TextureLoader();
	var terrainScene = new THREE.Scene();
	var globeScene = new THREE.Scene();

	var venusRadius = 6051.8;
	var venusTerrainDiff = 13.7; //distance between highest and lowest point in km
	var degToRad = Math.PI/180;

	//the orbiting camera over the globe
	var globeCamAltitude = 1.02; // in Venus radii
	var globeCamFov = 30;
	var globeCameraPivot = new THREE.Object3D();
	var globeCamera = new THREE.PerspectiveCamera(globeCamFov, 1, 0.01, globeCamAltitude);

	//direction indicator on minimap
	var centerToCam = new THREE.Vector3(0, 0, -1);
	var centerToAxis = new THREE.Vector3(0,1,0);
	var camAxis = new THREE.AxisHelper(0.2);

	//provides the minimap view
	var globeCam2 = new THREE.PerspectiveCamera(75, 1, 0.01, 100 );
	var globeCam2Lon = new THREE.Object3D();
	var globeCam2Lat = new THREE.Object3D();

	//the grayscale globe
	var globeGeo = new THREE.SphereGeometry(1,32,32);
	var globeMat = new THREE.MeshBasicMaterial();
	var globeMesh = new THREE.Mesh(globeGeo, globeMat);

	//camera for viewing the plane
	var terrainCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 100 );
	var terrainDetail = 128; //number of pixels sampled per side
	var terrainScale = 40; //size of the plane for terrain viz

	var terrainVehicleMat = new THREE.MeshStandardMaterial({color:0x999999, roughness:0.5,metalness:0});
	var terrainVehicleGeo = new THREE.BoxGeometry(0.1,0.1,0.05);
	var terrainVehicle = new THREE.Mesh(terrainVehicleGeo, terrainVehicleMat);

	var maxWalkSpeed = 0.0001;
	var maxTurnSpeed = 0.1;
	var walkSpeed = 0;
	var turnSpeed = 0;

	var heightMultiplier = setHeightMultiplier();

	//texture returned by globeCam
	var globeCamTexture = new THREE.WebGLRenderTarget( terrainDetail+1, terrainDetail+1, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter});
	var globeCamTextureData = new Uint8Array(globeCamTexture.width*globeCamTexture.height*4);

	//the terrain plane
	var terrainGeo = new THREE.PlaneGeometry(terrainScale, terrainScale, terrainDetail, terrainDetail);
	var terrainMat = new THREE.ShaderMaterial({
		uniforms: {
			heightMultiplier: { value: heightMultiplier },
			terrainDirection: {value: new THREE.Vector3()},
			terrainmap1: { value: new THREE.Texture()},
			terrainmap2: { value: new THREE.Texture()}
		},
		vertexShader: document.getElementById( 'vertexShader' ).textContent,
		fragmentShader: document.getElementById( 'fragmentShader' ).textContent,
	});
	var terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);

	//other terrain scene elements
	var terrainPivot = new THREE.Object3D();
	var dirLightPivot = new THREE.Object3D();
	var dirLight = new THREE.DirectionalLight(new THREE.Color(1,0.95,0.5), 0.2);
	var ambLight = new THREE.AmbientLight(new THREE.Color(0.6,0.57,0.33));
	var terrainFog = new THREE.Fog( 0xc8ac03, terrainScale/8, terrainScale/2);

	var terrainSkyboxGeo = new THREE.SphereGeometry(terrainScale/2, 16, 16);
	var terrainSkyboxMat = new THREE.MeshBasicMaterial({
		side: THREE.BackSide,
		transparent: true
	});
	var terrainSkybox = new THREE.Mesh(terrainSkyboxGeo, terrainSkyboxMat);

	//DOM stuff
	var mousePosition = new THREE.Vector2(0,0);
	var keys = {};

	Promise.all([loadPlanet(), loadSkyboxTexture(), loadTerrainTexture()]).then(function(){
		//renderer setup
		renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(renderer.domElement);

		//terrain scene setup
		//addTerrainShadowsAndFog();
		terrainMesh.rotation.x = -Math.PI/2;
		terrainMesh.rotation.z = -Math.PI/2;

		dirLight.position.set(0,terrainScale/8, terrainScale/2);
		dirLightPivot.add(dirLight);

		terrainPivot.add(terrainMesh, terrainSkybox, dirLightPivot, ambLight);
		terrainScene.add(terrainPivot);

		terrainMesh.add(terrainVehicle);
		terrainVehicle.add(terrainCamera);
		terrainCamera.position.set(-2,0,0);
		terrainCamera.up.set(0,0,1);
		terrainCamera.lookAt(new THREE.Vector3(0,0,0));

		//globe scene setup
		globeScene.add(globeMesh, globeCameraPivot, globeCam2Lon);
		globeCam2Lon.add(globeCam2Lat);
		globeCam2Lat.add(globeCam2);

		globeCameraPivot.add(globeCamera);
		globeCamera.position.set(0,0,-globeCamAltitude);
		globeCamera.lookAt(globeMesh.position);
		globeCamera.add(camAxis);

		globeCam2.position.set(0.1,0,-2);
		globeCam2.lookAt(globeMesh.position);

		renderAll();
	});

	function loadPlanet(){
		return new Promise(function(res){
			texLoad.load('img/Venus_Bump.jpg', function(tex){
				globeMat.map = tex;
				globeMat.needsUpdate = true;
				res();
			});
		});
	}

	function loadSkyboxTexture(){
		return new Promise(function(res){
			texLoad.load('img/sky.png', function(tex){
				terrainSkyboxMat.map = tex;
				terrainSkyboxMat.needsUpdate = true;
				res();
			});
		});
	}

	function loadTerrainTexture(){
		return Promise.all([
			new Promise(function(res){
				texLoad.load('img/highlands.png', function(tex){
					tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
					terrainMat.uniforms.terrainmap2.value = tex;
					terrainMat.needsUpdate = true;
					res();
				});
			}),
			new Promise(function(res){
				texLoad.load('img/basalt.png', function(tex){
					tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
					terrainMat.uniforms.terrainmap1.value = tex;
					terrainMat.needsUpdate = true;
					res();
				});
			})
		]);
	}

	function renderGlobe(){
		renderer.render(globeScene, globeCamera, globeCamTexture);
		renderer.readRenderTargetPixels(globeCamTexture, 0, 0, globeCamTexture.width, globeCamTexture.height, globeCamTextureData);
		terrainMesh.geometry.vertices.forEach(function(vert){
			vert.z = getHeightQuick(vert);
		});
		terrainMesh.geometry.verticesNeedUpdate = true;
		terrainMesh.geometry.computeVertexNormals();
		terrainMesh.geometry.normalsNeedUpdate = true;
	}

	function renderTerrain(){
		terrainVehicle.position.z = getHeightQuick(terrainVehicle.position)+0.025;
		renderer.setViewport(0,0,renderer.domElement.width,renderer.domElement.height);
		renderer.setScissor(0,0,renderer.domElement.width,renderer.domElement.height);
		renderer.setScissorTest(true);
		renderer.render(terrainScene, terrainCamera);
	}

	function renderMinimaps(){
		//planet minimap
		renderer.setViewport(0,0,window.innerWidth/4,window.innerWidth/4);
		renderer.setScissor(0,0,window.innerWidth/4,window.innerWidth/4);
		renderer.setScissorTest(true);
		renderer.render(globeScene, globeCam2);

		// //texture being rendered to terrain height
		renderer.setViewport(0,window.innerWidth/4,window.innerWidth/8,window.innerWidth/8);
		renderer.setScissor(0,window.innerWidth/4,window.innerWidth/8,window.innerWidth/8);
		renderer.setScissorTest(true);
		renderer.render(globeScene, globeCamera);
	}

	function renderAll(){
		window.requestAnimationFrame(renderAll);
		moveWithKeys();
		renderGlobe();
		renderTerrain();
		if(keys[16]){
			renderMinimaps();
		}
	}

	function addTerrainShadowsAndFog(){
		renderer.shadowMap.enabled = true;
		terrainMesh.castShadow = true;
		terrainMesh.receiveShadow = true;
		terrainScene.fog = terrainFog;
		dirLight.castShadow = true;
		dirLight.shadow.mapSize = new THREE.Vector2(2048,2048);
		terrainVehicle.castShadow = true;
		terrainVehicle.receiveShadow = true;
	}

	function setHeightMultiplier(){
		var distToSurf = venusRadius * (globeCamAltitude - 1);
		var terrainWidth = Math.tan(globeCamFov*degToRad)*distToSurf*2;
		return venusTerrainDiff * terrainScale / terrainWidth;
	}

	function getTerrainAltitude(altitude){
		return altitude * heightMultiplier/venusTerrainDiff;
	}

	function getHeightQuick(pt){
		var vx = Math.round(terrainDetail * (pt.x/terrainScale + 0.5));
		var vy = Math.round(terrainDetail * (pt.y/terrainScale + 0.5));
		var pixel = heightMultiplier * (globeCamTextureData[(vy * globeCamTexture.width * 4) + (vx * 4)] - 128)/255;
		return pixel * 2; //scaled by 2
	}

	function updateTerrainTexture(){
		var terrDirection = dirLightPivot.rotation.y;
		terrainMat.uniforms.terrainDirection.value = terrDirection;
	}

	function moveWithKeys(){

		if(keys[87]){
			walkSpeed += maxWalkSpeed/100;
			if(walkSpeed > maxWalkSpeed){
				walkSpeed= maxWalkSpeed;
			}
		}
		else if(keys[83]){
			walkSpeed -= maxWalkSpeed/100;
			if(walkSpeed < -maxWalkSpeed){
				walkSpeed = -maxWalkSpeed;
			}
		}
		else {
			walkSpeed *= 0.9;
			if(Math.abs(walkSpeed) < 0.00001){
				walkSpeed = 0;
			}
		}

		if(keys[65]){
			turnSpeed += maxTurnSpeed/100;
			if(turnSpeed > maxTurnSpeed){
				turnSpeed= maxTurnSpeed;
			}
		}
		else if(keys[68]){
			turnSpeed -= maxTurnSpeed/100;
			if(turnSpeed < -maxTurnSpeed){
				turnSpeed = -maxTurnSpeed;
			}
		}
		else {
			turnSpeed *= 0.9;
			if(Math.abs(turnSpeed) < 0.00001){
				turnSpeed = 0;
			}
		}

		globeCameraPivot.rotateOnAxis(centerToAxis, walkSpeed);
		globeCameraPivot.rotateOnAxis(centerToCam, turnSpeed);
		dirLightPivot.rotation.y -= turnSpeed;
		updateTerrainTexture();
	}

	document.addEventListener('keydown', function(e){
		keys[e.keyCode] = true;
	});

	document.addEventListener('mousemove', function(evt){
		var newMP = new THREE.Vector2(evt.clientX / window.innerWidth - 0.5, evt.clientY / window.innerHeight - 0.5);
		if(evt.buttons){
			if(evt.clientX <= window.innerWidth/4 && evt.clientY >= window.innerHeight - window.innerWidth/4 && keys[16]){
				//minimap
				globeCam2Lon.rotation.y -= 2*(newMP.x - mousePosition.x);
				globeCam2Lat.rotation.x += 2*(newMP.y - mousePosition.y);
			}
			else{
				var dx = (newMP.y - mousePosition.y);
				var dy = (newMP.x - mousePosition.x);
				terrainPivot.rotation.x += dx;
				terrainPivot.rotation.y += dy;
				globeCameraPivot.rotateOnAxis(centerToCam, dy);
				terrainCamera.position.z += dx;
				terrainCamera.lookAt(new THREE.Vector3(0,0,0));
				dirLightPivot.rotation.y -= dy;
				updateTerrainTexture();
			}
		}

		mousePosition = mousePosition.copy(newMP);
	});

	document.addEventListener('mousewheel', function(evt){
		if(evt.wheelDelta > 0){
			terrainCamera.position.multiplyScalar(0.9);
		}
		else if(evt.wheelDelta < 0){
			terrainCamera.position.multiplyScalar(1.1);
		}
	});

	document.addEventListener('keyup', function(e){
		keys[e.keyCode] = false;
	});

	window.addEventListener('resize', function(){
		renderer.setSize(window.innerWidth, window.innerHeight);
		terrainCamera.updateProjectionMatrix();
	});

})(window.THREE, window.Promise, window.console);