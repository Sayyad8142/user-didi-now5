import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, OrbitControls, Sphere, Cylinder, Box } from '@react-three/drei';
import * as THREE from 'three';

interface AlarmClockProps {
  isOpen: boolean;
}

function AlarmClock({ isOpen }: AlarmClockProps) {
  const clockRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    if (clockRef.current) {
      // Gentle floating animation
      clockRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      
      // Subtle rotation when not hovered
      if (!hovered) {
        clockRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.2;
      }
    }
  });

  const clockColor = isOpen ? '#10b981' : '#ef4444'; // Green when open, red when closed
  const secondaryColor = isOpen ? '#059669' : '#dc2626';

  return (
    <group 
      ref={clockRef}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      scale={hovered ? 1.1 : 1}
    >
      {/* Main clock body */}
      <Cylinder args={[1.2, 1.2, 0.3, 32]} position={[0, 0, 0]}>
        <meshPhongMaterial color={clockColor} />
      </Cylinder>

      {/* Clock face */}
      <Cylinder args={[1.1, 1.1, 0.01, 32]} position={[0, 0.16, 0]}>
        <meshPhongMaterial color="white" />
      </Cylinder>

      {/* Clock border */}
      <Cylinder args={[1.15, 1.15, 0.05, 32]} position={[0, 0.18, 0]}>
        <meshPhongMaterial color={secondaryColor} />
      </Cylinder>

      {/* Hour markers */}
      {[...Array(12)].map((_, i) => {
        const angle = (i * 30) * Math.PI / 180;
        const x = Math.sin(angle) * 0.9;
        const z = Math.cos(angle) * 0.9;
        return (
          <Box key={i} args={[0.05, 0.02, 0.15]} position={[x, 0.2, z]} rotation={[0, -angle, 0]}>
            <meshPhongMaterial color="#333" />
          </Box>
        );
      })}

      {/* Clock hands */}
      {/* Hour hand pointing to current hour or 6/7 */}
      <Box args={[0.03, 0.02, 0.5]} position={[0, 0.22, -0.25]} rotation={[0, 0, isOpen ? 0 : Math.PI]}>
        <meshPhongMaterial color="#333" />
      </Box>

      {/* Minute hand */}
      <Box args={[0.02, 0.02, 0.7]} position={[0, 0.23, -0.35]} rotation={[0, 0, 0]}>
        <meshPhongMaterial color="#333" />
      </Box>

      {/* Center dot */}
      <Sphere args={[0.05]} position={[0, 0.24, 0]}>
        <meshPhongMaterial color="#333" />
      </Sphere>

      {/* Alarm bells */}
      <Sphere args={[0.2]} position={[-0.8, 0.4, 0]}>
        <meshPhongMaterial color={clockColor} />
      </Sphere>
      <Sphere args={[0.2]} position={[0.8, 0.4, 0]}>
        <meshPhongMaterial color={clockColor} />
      </Sphere>

      {/* Alarm bell strikers */}
      <Sphere args={[0.05]} position={[-1.0, 0.4, 0]}>
        <meshPhongMaterial color="#fbbf24" />
      </Sphere>
      <Sphere args={[0.05]} position={[1.0, 0.4, 0]}>
        <meshPhongMaterial color="#fbbf24" />
      </Sphere>

      {/* Winding key */}
      <Cylinder args={[0.08, 0.08, 0.2, 8]} position={[0, 0, -1.3]} rotation={[Math.PI / 2, 0, 0]}>
        <meshPhongMaterial color="#fbbf24" />
      </Cylinder>

      {/* Clock legs */}
      <Cylinder args={[0.05, 0.05, 0.3]} position={[-0.6, -0.3, 0.6]}>
        <meshPhongMaterial color={secondaryColor} />
      </Cylinder>
      <Cylinder args={[0.05, 0.05, 0.3]} position={[0.6, -0.3, 0.6]}>
        <meshPhongMaterial color={secondaryColor} />
      </Cylinder>
    </group>
  );
}

export default function ThreeDAlarmClock({ isOpen }: AlarmClockProps) {
  return (
    <div className="w-full h-48 rounded-lg overflow-hidden bg-gradient-to-br from-blue-50 to-indigo-100">
      <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <pointLight position={[-5, -5, -5]} intensity={0.4} />
        
        <AlarmClock isOpen={isOpen} />
        
        <OrbitControls 
          enableZoom={false} 
          enablePan={false}
          autoRotate={false}
          maxPolarAngle={Math.PI / 2}
          minPolarAngle={Math.PI / 4}
        />
      </Canvas>
    </div>
  );
}