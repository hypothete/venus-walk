(function(THREE){
	'use strict';

	var renderer = new THREE.WebGLRenderer();
	var texLoad = new THREE.TextureLoader();
	var terrainScene = new THREE.Scene();
	var globeScene = new THREE.Scene();

	var venusRadius = 6051.8;
	var venusTerrainDiff = 13.7; //distance between highest and lowest point
	var degToRad = Math.PI/180;

	//the orbiting camera over the globe
	var globeCamAltitude = 1.02; // in vRadii
	var globeCamFov = 30;
	var globeCameraPivot = new THREE.Object3D();
	var globeCamera = new THREE.PerspectiveCamera(globeCamFov, 1, 0.01, globeCamAltitude);

	//direction indicator on minimap
	var camFwd = new THREE.Object3D();
	var camRight = new THREE.Object3D();
	var centerToCam = new THREE.Vector3();
	var centerToAxis = new THREE.Vector3();
	var camAxis = new THREE.AxisHelper(0.2);

	//provides the minimap view
	var globeCam2 = new THREE.PerspectiveCamera(75, 1, 0.01, 100 );
	var globeCam2Lon = new THREE.Object3D();
	var globeCam2Lat = new THREE.Object3D();

	//the grayscale globe
	var globeGeo = new THREE.SphereGeometry(1,32,32);
	var globeMat = new THREE.MeshBasicMaterial({
	});
	var globeMesh = new THREE.Mesh(globeGeo, globeMat);

	//camera for viewing the plane
	var terrainCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 100 );
	var terrainDetail = 128; //number of vertices/pixels sampled
	var terrainScale = 40; //size of the plane for terrain viz

	var terrainVehicleMat = new THREE.MeshStandardMaterial({color:0x999999, roughness:0.5,metalness:0});
	var terrainVehicleGeo = new THREE.BoxGeometry(0.1,0.1,0.05);
	var terrainVehicle = new THREE.Mesh(terrainVehicleGeo, terrainVehicleMat);
	//var terrainVehicleRaycaster = new THREE.Raycaster();
	//var normalArrow = new THREE.ArrowHelper(new THREE.Vector3(), new THREE.Vector3(), 0.5, 0x00ff00, 0.2, 0.2);

	var maxWalkSpeed = 0.0001;
	var maxTurnSpeed = 0.1;
	var walkSpeed = 0;
	var turnSpeed = 0;

	var heightMultiplier = getHeightMultiplier();

	//texture returned by globeCam
	var globeCamTexture = new THREE.WebGLRenderTarget( terrainDetail+1, terrainDetail+1, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter});
	var globeCamTextureData = new Uint8Array(globeCamTexture.width*globeCamTexture.height*4);

	//the terrain plane
	var terrainGeo = new THREE.PlaneGeometry(terrainScale, terrainScale, terrainDetail, terrainDetail);
	var terrainMat = new THREE.MeshStandardMaterial({
		roughness: 1,
		metalness: 0,
		color: new THREE.Color(0.43,0.41,0.4)
	});
	var terrainMat2 = new THREE.ShaderMaterial({
		uniforms: {
			heightMultiplier: { value: heightMultiplier },
			terrainDirection: {value: new THREE.Vector3()},
			terrainmap1: { value: new THREE.Texture()},
			terrainmap2: { value: new THREE.Texture()},
			walkSpeed: { value: walkSpeed }
		},
		vertexShader: document.getElementById( 'vertexShader' ).textContent,
		fragmentShader: document.getElementById( 'fragmentShader2' ).textContent,
	});
	var terrainMesh = new THREE.Mesh(terrainGeo, terrainMat2);

	//other terrain scene elements
	var terrainPivot = new THREE.Object3D();
	var dirLightPivot = new THREE.Object3D();
	var dirLight = new THREE.DirectionalLight(new THREE.Color(1,0.95,0.5), 0.2);
	//var dirLightIndicator = new THREE.DirectionalLightHelper(dirLight,1);
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

	Promise.all([loadPlanet(), loadSkyboxTexture2(), loadTerrainTexture()]).then(function(){
		//renderer setup
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.shadowMap.enabled = true;
		document.body.appendChild(renderer.domElement);

		//terrain scene setup
		terrainMesh.castShadow = true;
		terrainMesh.receiveShadow = true;
		terrainMesh.rotation.x = -Math.PI/2;
		terrainMesh.rotation.z = -Math.PI/2;

		dirLight.castShadow = true;
		dirLight.shadow.mapSize = new THREE.Vector2(2048,2048);
		dirLight.position.set(0,terrainScale/8, terrainScale/2);
		dirLightPivot.add(dirLight);

		terrainPivot.add(terrainMesh, terrainSkybox, dirLightPivot, ambLight);
		terrainScene.add(terrainPivot);
		//terrainScene.fog = terrainFog;
		terrainMesh.add(terrainVehicle);
		terrainVehicle.castShadow = true;
		terrainVehicle.receiveShadow = true;
		terrainVehicle.add(terrainCamera);
		terrainCamera.position.set(-2,0,0);
		terrainCamera.up.set(0,0,1);
		terrainCamera.lookAt(new THREE.Vector3(0,0,0));

		//terrainVehicleRaycaster.set(new THREE.Vector3(0,0,10), new THREE.Vector3(0,0,-1));

		//globe scene setup
		globeScene.add(globeMesh, globeCameraPivot, globeCam2Lon);
		globeCam2Lon.add(globeCam2Lat);
		globeCam2Lat.add(globeCam2);

		globeCameraPivot.add(globeCamera, camRight);
		globeCamera.position.set(0,0,-globeCamAltitude);
		globeCamera.lookAt(globeMesh.position);
		globeCamera.add(camAxis);

		camFwd.position.set(-1,0,0); //forward rotation point on the pivot
		camRight.position.set(0,1,0); //right rotation point on the pivot

		globeCamera.updateMatrixWorld();
		centerToCam.setFromMatrixPosition( globeCamera.matrixWorld ).normalize();

		camRight.updateMatrixWorld();
		centerToAxis.setFromMatrixPosition( camRight.matrixWorld ).normalize();

		globeCam2.position.set(0.1,0,-2);
		globeCam2.lookAt(globeMesh.position);

		renderAll(0);
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

	function loadSkyboxTexture2(){
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
					terrainMat2.uniforms.terrainmap2.value = tex;
					terrainMat2.needsUpdate = true;
					res();
				});
			}),
			new Promise(function(res){
				texLoad.load('img/basalt.png', function(tex){
					tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
					terrainMat2.uniforms.terrainmap1.value = tex;
					terrainMat2.needsUpdate = true;
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
		//terrainMesh.geometry.computeFaceNormals();
		terrainMesh.geometry.computeVertexNormals();
		terrainMesh.geometry.normalsNeedUpdate = true;
	}

	function renderTerrain(){
		terrainVehicle.position.z = getHeightQuick(terrainVehicle.position)+0.025;
		
		// if(terrainCamera.position.y < terrainVehicle.position.z){
		// 	terrainCamera.position.y = terrainVehicle.position.z;
		// }
		// var groundIntersect = terrainVehicleRaycaster.intersectObject(terrainMesh);
		// if(groundIntersect.length){
		// 	normalArrow.setDirection(groundIntersect[0].face.normal);
		// }

		renderer.setViewport(0,0,renderer.domElement.width,renderer.domElement.height);
		renderer.setScissor(0,0,renderer.domElement.width,renderer.domElement.height);
		renderer.setScissorTest(true);
		//renderer.setClearColor ( 0x000000, 255 );
		renderer.render(terrainScene, terrainCamera);
		if(keys[16]){
			renderMinimaps();
		}
	}

	function renderMinimaps(){
		//renderer.setClearColor ( 0x000000, 0 );

		//planet minimap
		renderer.setViewport(0,0,window.innerWidth/4,window.innerWidth/4);
		renderer.setScissor(0,0,window.innerWidth/4,window.innerWidth/4);
		renderer.setScissorTest(true);
		renderer.render(globeScene, globeCam2);

		// //texture being rendered to terrain height
		renderer.setViewport(0,384,256,256);
		renderer.setScissor(0,384,256,256);
		renderer.setScissorTest(true);
		renderer.render(globeScene, globeCamera);
	}

	function renderAll(){
		window.requestAnimationFrame(renderAll);
		moveWithKeys();
		renderGlobe();
		renderTerrain();
	}

	function getHeightMultiplier(){
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
		return pixel * 2;
	}

	function updateTerrainTexture(){
		var terrDirection = dirLightPivot.rotation.y;
		terrainMat2.uniforms.terrainDirection.value = terrDirection;
		terrainMat2.uniforms.walkSpeed.value = walkSpeed;
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
		else if(!keys[87] && !keys[83]){
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
		//dirLightIndicator.update();
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
				//terrainCamera.rotateOnAxis(new THREE.Vector3(1,0,0),dx);
				terrainCamera.position.z += dx;
				terrainCamera.lookAt(new THREE.Vector3(0,0,0));
				dirLightPivot.rotation.y -= dy;
				updateTerrainTexture();
				//dirLightIndicator.update();
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

	})

})(window.THREE);