"use client";

import { useState, useEffect, useRef } from "react";
import ROSLIB from "roslib";

// Definir la interfaz para el resultado del servicio
interface MotorServiceResult {
  success: boolean;
  message?: string;
  previous_positions?: number[];
}

// Función para convertir grados a radianes
const degreesToRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

// Función para convertir radianes a grados
const radiansToDegrees = (radians: number): number => {
  return radians * (180 / Math.PI);
};

export default function MotorControl() {
  const serviceRef = useRef<ROSLIB.Service | undefined>(undefined);
  const [angleDegrees, setAngleDegrees] = useState(0); // Ángulo en grados
  const [motorId, setMotorId] = useState(1);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ROSBRIDGE_URL = process.env.NEXT_PUBLIC_ROSBRIDGE_URL!;

  // 1. Conectar a rosbridge al montar el componente
  useEffect(() => {
    const rosConn = new ROSLIB.Ros({
      url: ROSBRIDGE_URL
    });
    
    rosConn.on("connection", () => {
      console.log("✅ Conectado a ROSBridge");
      setConnected(true);
      setLastMessage("Conectado a ROSBridge correctamente");
    });
    
    rosConn.on("error", (err: Error) => {
      console.error("❌ Error de conexión a ROSBridge:", err);
      setConnected(false);
      setLastMessage(`Error de conexión: ${err.message}`);
    });
    
    rosConn.on("close", () => {
      console.log("⚠️ Conexión a ROSBridge cerrada");
      setConnected(false);
      setLastMessage("Conexión a ROSBridge cerrada");
    });

    // Crear el servicio una vez conectado
    serviceRef.current = new ROSLIB.Service({
      ros: rosConn,
      name: "/westwood_motor/set_motor_id_and_target",
      serviceType: "westwood_motor_interfaces/SetMotorIdAndTarget"
    });

    // Cleanup al desmontar
    return () => {
      rosConn.close();
    };
  }, []);

  // 2. Función para llamar al servicio con la posición deseada
  const callMotorService = (motorId: number, angleDeg: number) => {
    if (!serviceRef.current) {
      console.warn("Servicio no inicializado aún");
      setLastMessage("Servicio no inicializado. ¿Está corriendo rosbridge?");
      return;
    }

    setLoading(true);
    setLastMessage("Enviando comando al motor...");

    // Convertir de grados a radianes para el servicio
    const angleRad = degreesToRadians(angleDeg);

    const request = new ROSLIB.ServiceRequest({
      motor_ids: [motorId],           // ID del motor a controlar
      target_positions: [angleRad]    // posición en radianes
    });

    serviceRef.current.callService(request, (result: MotorServiceResult) => {
      setLoading(false);
      if (result.success) {
        // Convertir la posición anterior de radianes a grados para mostrarla
        const prevPositionRad = result.previous_positions?.[0] || 0;
        const prevPositionDeg = radiansToDegrees(prevPositionRad);
        
        setLastMessage(`✔️ Motor ${motorId} movido de ${prevPositionDeg.toFixed(1)}° a ${angleDeg.toFixed(1)}°`);
        console.log("✔️ Motor movido:", result.previous_positions);
      } else {
        setLastMessage(`❌ Error: ${result.message || "Error desconocido"}`);
        console.error("❌ Error en servicio:", result.message);
      }
    }, (error) => {
      setLoading(false);
      setLastMessage(`❌ Error en la llamada al servicio: ${error}`);
      console.error("Error en la llamada al servicio:", error);
    });
  };

  // 3. Al cambiar el slider, actualizamos localmente y llamamos al servicio
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAngleDeg = parseFloat(e.target.value);
    setAngleDegrees(newAngleDeg);
    callMotorService(motorId, newAngleDeg);
  };

  // Manejar cambio de ID del motor
  const handleMotorIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newId = parseInt(e.target.value);
    setMotorId(newId);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Control de Motor Westwood</h1>
      
      <div className="mb-4 flex items-center">
        <div className={`w-3 h-3 rounded-full mr-2 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
        <span>{connected ? 'Conectado a ROSBridge' : 'Desconectado'}</span>
      </div>

      {lastMessage && (
        <div className="mb-6 p-3 border rounded">
          {lastMessage}
        </div>
      )}
      
      <div className="mb-6">
        <label htmlFor="motor-id" className="block mb-2">
          ID del Motor:
        </label>
        <input
          id="motor-id"
          type="number"
          min="1"
          max="254"
          value={motorId}
          onChange={handleMotorIdChange}
          className="border rounded p-2 w-20"
        />
      </div>

      <div className="mb-6">
        <label htmlFor="motor-slider" className="block mb-2">
          Ángulo objetivo: {angleDegrees.toFixed(1)}° ({degreesToRadians(angleDegrees).toFixed(4)} rad)
        </label>
        <input
          id="motor-slider"
          type="range"
          min="-360"
          max="360"
          step="1"
          value={angleDegrees}
          onChange={handleSliderChange}
          disabled={loading || !connected}
          className="w-full"
        />
      </div>
      
      <div className="flex flex-wrap gap-2 justify-between">
        <button 
          onClick={() => callMotorService(motorId, -360)}
          disabled={loading || !connected}
          className="bg-blue-500 text-white py-2 px-4 rounded disabled:bg-gray-300"
        >
          -360°
        </button>
        <button 
          onClick={() => callMotorService(motorId, -180)}
          disabled={loading || !connected}
          className="bg-blue-500 text-white py-2 px-4 rounded disabled:bg-gray-300"
        >
          -180°
        </button>
        <button 
          onClick={() => callMotorService(motorId, 0)}
          disabled={loading || !connected}
          className="bg-blue-500 text-white py-2 px-4 rounded disabled:bg-gray-300"
        >
          0°
        </button>
        <button 
          onClick={() => callMotorService(motorId, 180)}
          disabled={loading || !connected}
          className="bg-blue-500 text-white py-2 px-4 rounded disabled:bg-gray-300"
        >
          180°
        </button>
        <button 
          onClick={() => callMotorService(motorId, 360)}
          disabled={loading || !connected}
          className="bg-blue-500 text-white py-2 px-4 rounded disabled:bg-gray-300"
        >
          360°
        </button>
      </div>
    </div>
  );
}
