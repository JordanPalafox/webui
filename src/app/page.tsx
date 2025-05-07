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
  const [isMoving, setIsMoving] = useState(false);

  const ROSBRIDGE_URL = process.env.NEXT_PUBLIC_ROSBRIDGE_URL!;

  // 1. Conectar a rosbridge al montar el componente
  useEffect(() => {
    const rosConn = new ROSLIB.Ros({
      url: ROSBRIDGE_URL,
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
      serviceType: "westwood_motor_interfaces/SetMotorIdAndTarget",
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
    setIsMoving(true);
    setLastMessage("Enviando comando al motor...");

    // Convertir de grados a radianes para el servicio
    const angleRad = degreesToRadians(angleDeg);

    const request = new ROSLIB.ServiceRequest({
      motor_ids: [motorId], // ID del motor a controlar
      target_positions: [angleRad], // posición en radianes
    });

    serviceRef.current.callService(
      request,
      (result: MotorServiceResult) => {
        setLoading(false);
        if (result.success) {
          // Convertir la posición anterior de radianes a grados para mostrarla
          const prevPositionRad = result.previous_positions?.[0] || 0;
          const prevPositionDeg = radiansToDegrees(prevPositionRad);

          setLastMessage(
            `✔️ Motor ${motorId} movido de ${prevPositionDeg.toFixed(
              1
            )}° a ${angleDeg.toFixed(1)}°`
          );
          console.log("✔️ Motor movido:", result.previous_positions);

          // Simular que el motor dejó de moverse después de un tiempo
          setTimeout(() => {
            setIsMoving(false);
          }, 1000);
        } else {
          setIsMoving(false);
          setLastMessage(`❌ Error: ${result.message || "Error desconocido"}`);
          console.error("❌ Error en servicio:", result.message);
        }
      },
      (error) => {
        setLoading(false);
        setIsMoving(false);
        setLastMessage(`❌ Error en la llamada al servicio: ${error}`);
        console.error("Error en la llamada al servicio:", error);
      }
    );
  };

  // Manejar cambio de ID del motor
  const handleMotorIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newId = parseInt(e.target.value);
    setMotorId(newId);
  };

  // Preset positions in degrees
  const presetPositions = [-360, -270, -180, -90, 0, 90, 180, 270, 360];

  return (
    <div className="overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">Control de Motor Westwood</h1>
          <div
            className={`px-2 py-1 rounded-full text-xs ${
              isMoving
                ? "bg-blue-100 text-blue-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {isMoving ? "MOVIENDO" : "INACTIVO"}
          </div>
        </div>
        <p className="text-sm text-gray-500">
          Control de posición del motor en grados
        </p>
      </div>

      <div className="p-4 space-y-8">
        {/* Estado de conexión */}
        <div className="mb-4 flex items-center">
          <div
            className={`w-3 h-3 rounded-full mr-2 ${
              connected ? "bg-green-500" : "bg-red-500"
            }`}
          ></div>
          <span className="text-sm">
            {connected ? "Conectado a ROSBridge" : "Desconectado"}
          </span>
        </div>

        {lastMessage && (
          <div className="mb-6 p-3 border rounded text-sm">{lastMessage}</div>
        )}

        {/* ID del motor */}
        <div className="mb-6 flex justify-center flex-col items-center">
          <label htmlFor="motor-id" className="block mb-2 text-sm font-medium">
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

        {/* Position Visualization */}
        <div className="flex justify-center py-4">
          <div className="relative w-48 h-48">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-40 h-40 rounded-full border-4 border-gray-200 flex items-center justify-center">
                {/* Degree markers */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((degree) => (
                  <div
                    key={degree}
                    className="absolute w-full h-full"
                    style={{ transform: `rotate(${degree}deg)` }}
                  >
                    <div className="absolute top-0 left-1/2 -ml-0.5 w-1 h-3 bg-gray-400"></div>
                    <div className="absolute top-3 left-1/2 -ml-2 text-[10px] text-gray-500">
                      {degree}°
                    </div>
                  </div>
                ))}

                {/* Motor indicator */}
                <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center relative">
                  <div
                    className="absolute w-full h-full transition-transform duration-300"
                    style={{ transform: `rotate(${angleDegrees}deg)` }}
                  >
                    <div className="absolute top-0 left-1/2 -ml-0.5 w-1 h-12 bg-red-500"></div>
                  </div>
                  <div className="z-10 bg-white rounded-full w-16 h-16 flex items-center justify-center shadow-inner">
                    <span className="font-mono font-bold">
                      {Math.round(angleDegrees)}°
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Position Slider */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Posición (grados)</span>
            <span className="text-sm font-bold">
              {Math.round(angleDegrees)}°
            </span>
          </div>
          <input
            type="range"
            min="-360"
            max="360"
            step="1"
            value={angleDegrees}
            onChange={(e) => {
              const newAngle = parseFloat(e.target.value);
              setAngleDegrees(newAngle);
              callMotorService(motorId, newAngle);
            }}
            disabled={loading || !connected}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>-360°</span>
            <span>-180°</span>
            <span>0°</span>
            <span>180°</span>
            <span>360°</span>
          </div>
        </div>

        {/* Preset Buttons */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Posiciones Predefinidas</span>
          <div className="grid grid-cols-3 gap-2">
            {presetPositions.map((degrees) => (
              <button
                key={degrees}
                onClick={() => {
                  setAngleDegrees(degrees);
                  callMotorService(motorId, degrees);
                }}
                disabled={loading || !connected}
                className={`px-3 py-2 text-sm font-medium rounded-md flex items-center justify-center ${
                  angleDegrees === degrees
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                } relative`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-1 opacity-70"
                >
                  <path d="M21 2v6h-6"></path>
                  <path d="M21 13a9 9 0 1 1-3-7.7L21 8"></path>
                </svg>
                {degrees}°
                {angleDegrees === degrees && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full"></div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
