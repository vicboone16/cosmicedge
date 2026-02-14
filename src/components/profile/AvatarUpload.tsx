import { useState, useRef } from "react";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface AvatarUploadProps {
  userId: string;
  avatarUrl: string;
  displayName: string;
  onUploaded: (url: string) => void;
}

export function AvatarUpload({ userId, avatarUrl, displayName, onUploaded }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const initials = displayName
    ? displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Too large", description: "Max 5 MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/avatar.${ext}`;

    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { data: publicData } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = `${publicData.publicUrl}?t=${Date.now()}`;

    await supabase.from("profiles").update({ avatar_url: url } as any).eq("user_id", userId);
    onUploaded(url);
    toast({ title: "Photo updated!" });
    setUploading(false);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="relative group"
      >
        <Avatar className="h-20 w-20 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {uploading ? (
            <Loader2 className="h-5 w-5 text-white animate-spin" />
          ) : (
            <Camera className="h-5 w-5 text-white" />
          )}
        </div>
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
      <p className="text-[10px] text-muted-foreground">Tap to change photo</p>
    </div>
  );
}
